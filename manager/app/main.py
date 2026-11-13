from __future__ import annotations

import asyncio
import hmac
import logging
import os
from contextlib import asynccontextmanager, suppress
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote, urlsplit

from authlib.integrations.starlette_client import OAuth
from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    PlainTextResponse,
    RedirectResponse,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from starlette.middleware.sessions import SessionMiddleware

from .config import Settings, get_settings
from .db import SessionLocal, get_db, init_db
from .docker_service import DockerService, SandboxRuntimeError
from .models import AuditLog, LlmProfile, Sandbox, SandboxTemplate, User
from .plugin_registry import PluginRegistryService
from .scheduler import BackgroundWorker
from .schemas import (
    AdminCreate,
    AdminOut,
    HealthOut,
    LlmProfileCreate,
    LlmProfileOut,
    SandboxCreate,
    SandboxList,
    SandboxOut,
    SandboxPatch,
    TemplateCreate,
    TemplateOut,
    TemplateUpdate,
    UserCreate,
    UserOut,
    UserPasswordChange,
    UserUpdate,
)
from .security import encrypt_secret, hash_password, verify_password
from .services import (
    Conflict,
    ManagerError,
    NotFoundError,
    add_platform_admin,
    audit,
    create_llm_profile,
    create_sandbox,
    create_template,
    deactivate_platform_admin,
    delete_sandbox,
    delete_template,
    ensure_bootstrap_admin,
    ensure_default_templates,
    is_platform_admin,
    list_platform_admins,
    list_templates,
    load_sandbox,
    load_sandbox_by_slug,
    refresh_status,
    restart_sandbox,
    start_sandbox,
    stop_sandbox,
    update_sandbox_limits,
    update_template,
    upgrade_sandbox,
)

logger = logging.getLogger("dsh-manager")
settings = get_settings()
WEB_DIST_DIR = Path(__file__).parent / "web_dist"

oauth = OAuth()
if settings.manager_auth_mode == "oidc" and (
    settings.oidc_discovery_url or settings.oidc_issuer_url
):
    discovery_url = (
        settings.oidc_discovery_url.strip()
        or f"{settings.oidc_issuer_url.rstrip('/')}/.well-known/openid-configuration"
    )
    oauth.register(
        name="oidc",
        client_id=settings.oidc_client_id,
        client_secret=settings.oidc_client_secret,
        server_metadata_url=discovery_url,
        client_kwargs={
            "scope": settings.oidc_scope,
            **(
                {"verify": os.environ["SSL_CERT_FILE"]}
                if os.environ.get("SSL_CERT_FILE")
                else {}
            ),
        },
    )


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.secret_key in {
        "change-me-in-production",
        "replace-with-a-long-random-secret",
    }:
        raise RuntimeError("SECRET_KEY must be set to a long random value")

    if not settings.manager_admin_email:
        raise RuntimeError("MANAGER_ADMIN_EMAIL is required")

    if settings.manager_auth_mode == "oidc":
        missing = [
            name
            for name, value in {
                "OIDC_ISSUER_URL (or OIDC_DISCOVERY_URL)": (
                    settings.oidc_issuer_url or settings.oidc_discovery_url
                ),
                "OIDC_CLIENT_ID": settings.oidc_client_id,
                "OIDC_CLIENT_SECRET": settings.oidc_client_secret,
            }.items()
            if not value
        ]
        if missing:
            raise RuntimeError(
                f"MANAGER_AUTH_MODE=oidc requires: {', '.join(missing)}"
            )
    elif settings.manager_auth_mode == "token":
        if not settings.manager_admin_token:
            raise RuntimeError(
                "MANAGER_AUTH_MODE=token requires MANAGER_ADMIN_TOKEN to be set"
            )

    init_db()
    with SessionLocal() as db:
        ensure_bootstrap_admin(db, settings.manager_admin_email)
        ensure_default_templates(db, settings)

    worker_task: asyncio.Task | None = None
    if settings.background_tasks:
        worker = BackgroundWorker(settings, get_docker())
        worker_task = asyncio.create_task(worker.run())
    try:
        yield
    finally:
        if worker_task is not None:
            worker_task.cancel()
            with suppress(asyncio.CancelledError):
                await worker_task


app = FastAPI(
    title="DSH Sandbox Manager",
    version="0.3.0",
    lifespan=lifespan,
)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="dsh_manager_session",
    same_site="lax",
    https_only=settings.manager_base_url.startswith("https"),
)

if (WEB_DIST_DIR / "assets").is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=str(WEB_DIST_DIR / "assets")),
        name="spa-assets",
    )


@lru_cache
def get_docker() -> DockerService:
    return DockerService(settings)


@lru_cache
def get_plugin_registry() -> PluginRegistryService:
    return PluginRegistryService(settings)


def sandbox_out(sandbox: Sandbox) -> SandboxOut:
    return SandboxOut(
        id=sandbox.id,
        email=sandbox.user.email,
        display_name=sandbox.user.display_name,
        slug=sandbox.slug,
        container_id=sandbox.container_id,
        volume_name=sandbox.volume_name,
        image_repo=sandbox.image_repo or settings.dsh_image_repo,
        image_tag=sandbox.image_tag,
        template=sandbox.template or "agent-os",
        init_repo_url=sandbox.init_repo_url,
        auto_install_plugins=sandbox.auto_install_plugins,
        llm_profile_id=sandbox.llm_profile_id,
        llm_profile_name=sandbox.llm_profile.name if sandbox.llm_profile else None,
        cpu_limit=(
            sandbox.cpu_limit
            if sandbox.cpu_limit is not None
            else settings.sandbox_cpus
        ),
        memory_limit=sandbox.memory_limit or settings.sandbox_memory,
        status=sandbox.status,
        url=settings.sandbox_url(sandbox.slug),
        created_at=sandbox.created_at,
        last_seen_at=sandbox.last_seen_at,
        deleted_at=sandbox.deleted_at,
    )


def _user_out(user: User, sandbox_count: int = 0) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        status=user.status,
        has_password=bool(user.password_hash),
        sandbox_count=sandbox_count,
        created_at=user.created_at,
    )


def _ensure_active_user(db: Session, email: str) -> User | None:
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user and user.status != "active":
        raise HTTPException(
            status_code=403,
            detail="该账号已被管理员禁用，请联系平台管理员",
        )
    return user


def _manager_error(exc: Exception) -> HTTPException:
    if isinstance(exc, NotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, Conflict):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, SandboxRuntimeError):
        return HTTPException(status_code=502, detail=str(exc))
    if isinstance(exc, ManagerError):
        return HTTPException(status_code=502, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


@app.get("/healthz", response_model=HealthOut)
def healthz(db: Session = Depends(get_db)):
    db_ok = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        db_ok = f"error: {exc}"

    docker_ok = "ok"
    try:
        get_docker().client.ping()
    except Exception as exc:
        docker_ok = f"error: {exc}"

    if db_ok != "ok" or docker_ok != "ok":
        raise HTTPException(
            status_code=503,
            detail={"database": db_ok, "docker": docker_ok},
        )
    return HealthOut(status="ok", database=db_ok, docker=docker_ok)


# ---------------------------------------------------------------------------
# Self-hosted Plugin Discover Index & Built-in Read-Only NPM Registry
# ---------------------------------------------------------------------------


@app.get("/plugins/index.json")
def plugin_discover_index():
    base_url = settings.manager_base_url
    doc = get_plugin_registry().build_index(base_url)
    return JSONResponse(
        content=doc,
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/plugins/icons/{icon_name}")
def plugin_icon(icon_name: str):
    icon_path = get_plugin_registry().resolve_icon(icon_name)
    if not icon_path:
        raise HTTPException(status_code=404, detail="icon not found")
    media_type = (
        "image/svg+xml"
        if icon_path.suffix.lower() == ".svg"
        else "application/octet-stream"
    )
    return FileResponse(
        path=str(icon_path),
        media_type=media_type,
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/plugins/packages/{tarball_name}")
def plugin_tarball(tarball_name: str):
    pkg = get_plugin_registry().get_by_slug_or_filename(tarball_name)
    if not pkg:
        raise HTTPException(status_code=404, detail="plugin package not found")
    return Response(
        content=pkg.tarball_bytes,
        media_type="application/gzip",
        headers={
            "Cache-Control": "no-cache",
            "Content-Disposition": f'attachment; filename="{pkg.slug}-{pkg.version}.tgz"',
        },
    )


@app.get("/plugins/npm/{package_name:path}")
def plugin_npm_packument(package_name: str):
    pkg = get_plugin_registry().get_by_package_name(package_name)
    if not pkg:
        return RedirectResponse(
            url=f"https://registry.npmmirror.com/{package_name}",
            status_code=307,
        )
    packument = get_plugin_registry().build_npm_packument(
        pkg, settings.sandbox_reachable_manager_url
    )
    return JSONResponse(
        content=packument,
        headers={"Cache-Control": "no-cache"},
    )


# ---------------------------------------------------------------------------
# Authentication & Sessions
# ---------------------------------------------------------------------------


def _bearer_is_admin(request: Request) -> bool:
    if not settings.manager_admin_token:
        return False
    auth_header = request.headers.get("authorization") or ""
    if not auth_header.lower().startswith("bearer "):
        return False
    provided = auth_header[7:].strip()
    return hmac.compare_digest(provided, settings.manager_admin_token)


def session_email(request: Request) -> str:
    if settings.manager_auth_mode == "none":
        email = settings.manager_admin_email.lower()
        request.session["email"] = email
        return email
    return str(request.session.get("email") or "").lower()


def _is_authenticated_admin(request: Request, db: Session) -> bool:
    if _bearer_is_admin(request):
        return True
    email = session_email(request)
    if not email or not is_platform_admin(db, email):
        return False
    if settings.manager_auth_mode == "token":
        return request.session.get("role") == "admin"
    return True


def require_admin_api(
    request: Request,
    db: Session = Depends(get_db),
) -> None:
    if _is_authenticated_admin(request, db):
        return
    email = session_email(request)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请先登录管理员账号",
        )
    raise HTTPException(status_code=403, detail="当前账号无管理员权限")


def require_user_api(request: Request) -> str:
    email = session_email(request)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请先登录",
        )
    return email


def safe_next(value: str | None) -> str:
    if value and value.startswith("/") and not value.startswith("//"):
        return value
    return "/admin"


class LoginPayload(BaseModel):
    email: str
    token: str | None = None
    password: str | None = None
    mode: str = "admin"


@app.get("/api/auth/me")
@app.get("/auth/me", include_in_schema=False)
def auth_me(request: Request, db: Session = Depends(get_db)):
    email = session_email(request)
    admin = _is_authenticated_admin(request, db)
    user_row = (
        db.scalar(select(User).where(User.email == email))
        if email
        else None
    )
    return {
        "authenticated": bool(email),
        "email": email,
        "admin": admin,
        "user_status": user_row.status if user_row else "active",
        "has_password": bool(user_row and user_row.password_hash),
        "auth_mode": settings.manager_auth_mode,
        "default_admin_email": settings.manager_admin_email,
        "public_url": settings.manager_base_url,
        "plugin_index_url": settings.plugin_index_url,
    }


@app.get("/api/auth/verify-sandbox/{slug}", include_in_schema=False)
def verify_sandbox_access(
    slug: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Traefik ForwardAuth endpoint: enforce that only the workspace owner or platform admin can access /s/<slug>."""
    try:
        sandbox = load_sandbox_by_slug(db, slug)
    except NotFoundError:
        raise HTTPException(status_code=404, detail=f"工作区 /s/{slug} 不存在")

    email = session_email(request)
    is_admin = _is_authenticated_admin(request, db)
    accept = (request.headers.get("accept") or "").lower()
    wants_html = "text/html" in accept

    if not email and not is_admin:
        if wants_html:
            html = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>需要登录 - DSH Sandbox Cloud</title>
<style>body{{margin:0;background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}}
.card{{max-width:420px;padding:28px;border-radius:14px;background:#18181b;border:1px solid #27272a;box-shadow:0 20px 40px rgba(0,0,0,.5)}}
h2{{margin:0 0 10px;font-size:18px}}p{{margin:0 0 20px;font-size:13px;color:#a1a1aa;line-height:1.6}}
a.btn{{display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:500}}</style></head>
<body><div class="card"><h2>请先登录工作区平台</h2>
<p>访问工作区 <code>/s/{slug}/</code> 需要验证您的身份，仅工作区归属人本人或平台管理员可进入。</p>
<a class="btn" href="/login">前往登录</a></div></body></html>"""
            return HTMLResponse(content=html, status_code=401)
        raise HTTPException(status_code=401, detail="请先登录平台后再访问工作区")

    owner_email = sandbox.user.email.lower()
    if not is_admin and email != owner_email:
        if wants_html:
            html = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>403 禁止访问 - DSH Sandbox Cloud</title>
<style>body{{margin:0;background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}}
.card{{max-width:440px;padding:28px;border-radius:14px;background:#18181b;border:1px solid #3f3f46;box-shadow:0 20px 40px rgba(0,0,0,.5)}}
h2{{margin:0 0 10px;font-size:18px;color:#fb7185}}p{{margin:0 0 20px;font-size:13px;color:#a1a1aa;line-height:1.6}}
code{{background:#27272a;padding:2px 6px;border-radius:4px;color:#e4e4e7}}
a.btn{{display:inline-block;background:#27272a;color:#f4f4f5;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:500;border:1px solid #3f3f46}}</style></head>
<body><div class="card"><h2>403 禁止访问他人工作区</h2>
<p>工作区 <code>/s/{slug}/</code> 归属于 <code>{owner_email}</code>。<br>当前登录账号 <code>{email}</code> 无权访问（仅归属人本人或平台管理员可访问）。</p>
<a class="btn" href="/my">返回我的工作区</a></div></body></html>"""
            return HTMLResponse(content=html, status_code=403)
        raise HTTPException(
            status_code=403,
            detail=f"禁止访问：工作区 /s/{slug} 仅归属人 ({owner_email}) 或管理员可访问",
        )

    if not is_admin and sandbox.user.status != "active":
        if wants_html:
            html = f"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>403 账号已禁用 - DSH Sandbox Cloud</title>
<style>body{{margin:0;background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}}
.card{{max-width:440px;padding:28px;border-radius:14px;background:#18181b;border:1px solid #3f3f46;box-shadow:0 20px 40px rgba(0,0,0,.5)}}
h2{{margin:0 0 10px;font-size:18px;color:#fb7185}}p{{margin:0 0 20px;font-size:13px;color:#a1a1aa;line-height:1.6}}
code{{background:#27272a;padding:2px 6px;border-radius:4px;color:#e4e4e7}}
a.btn{{display:inline-block;background:#27272a;color:#f4f4f5;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:500;border:1px solid #3f3f46}}</style></head>
<body><div class="card"><h2>403 账号已被禁用</h2>
<p>账号 <code>{email}</code> 已被平台管理员禁用，暂时无法访问工作区 <code>/s/{slug}/</code>。</p>
<a class="btn" href="/login">返回登录页</a></div></body></html>"""
            return HTMLResponse(content=html, status_code=403)
        raise HTTPException(
            status_code=403,
            detail=f"禁止访问：账号 {email} 已被管理员禁用",
        )

    effective_user = email or settings.manager_admin_email.lower()
    return Response(
        status_code=200,
        headers={
            "X-Auth-Request-Email": effective_user,
            "X-Forwarded-User": effective_user,
            "X-Sandbox-Owner": owner_email,
        },
    )


@app.post("/api/auth/login")
def api_auth_login(
    payload: LoginPayload,
    request: Request,
    db: Session = Depends(get_db),
):
    clean_email = payload.email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="请输入有效的邮箱地址")

    if settings.manager_auth_mode == "none":
        request.session["email"] = clean_email
        return {
            "authenticated": True,
            "email": clean_email,
            "admin": is_platform_admin(db, clean_email),
        }

    if settings.manager_auth_mode == "token":
        if payload.mode == "user":
            if is_platform_admin(db, clean_email):
                raise HTTPException(
                    status_code=401,
                    detail="管理员账号请切换至“管理员控制台”并输入 Admin Token 登录",
                )
            user = db.scalar(select(User).where(User.email == clean_email))
            secret = (
                payload.password if payload.password is not None else payload.token
            ) or ""
            if not user:
                raise HTTPException(status_code=401, detail="邮箱或密码错误")
            if user.status != "active":
                raise HTTPException(
                    status_code=403, detail="该账号已被管理员禁用，请联系平台管理员"
                )
            if not user.password_hash:
                raise HTTPException(
                    status_code=401,
                    detail="该账号尚未设置登录密码，请联系管理员设置初始密码",
                )
            if not verify_password(secret, user.password_hash):
                raise HTTPException(status_code=401, detail="邮箱或密码错误")
            request.session["email"] = clean_email
            request.session["role"] = "user"
            return {
                "authenticated": True,
                "email": clean_email,
                "admin": False,
            }
        if not payload.token or not hmac.compare_digest(
            payload.token.strip(), settings.manager_admin_token
        ):
            raise HTTPException(status_code=401, detail="管理员口令 (Admin Token) 错误")
        if not is_platform_admin(db, clean_email):
            raise HTTPException(
                status_code=403, detail=f"邮箱 {clean_email} 不是平台管理员"
            )
        request.session["email"] = clean_email
        request.session["role"] = "admin"
        return {
            "authenticated": True,
            "email": clean_email,
            "admin": True,
        }

    raise HTTPException(status_code=400, detail="当前已启用 OIDC 登录，请通过 SSO 跳转")


@app.post("/api/auth/logout")
def api_auth_logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/auth/oidc/start", include_in_schema=False)
async def auth_oidc_start(request: Request):
    next_url = safe_next(request.query_params.get("next", "/admin"))
    request.session["next"] = next_url
    if settings.manager_auth_mode != "oidc":
        return RedirectResponse("/login", status_code=303)
    redirect_uri = f"{settings.manager_base_url}/auth/callback"
    return await oauth.oidc.authorize_redirect(request, redirect_uri)


@app.get("/auth/callback", include_in_schema=False)
async def auth_callback(request: Request, db: Session = Depends(get_db)):
    if settings.manager_auth_mode != "oidc":
        return RedirectResponse("/admin", status_code=303)
    token = await oauth.oidc.authorize_access_token(request)
    userinfo = token.get("userinfo") or {}
    claim = settings.oidc_email_claim
    email = userinfo.get(claim) or userinfo.get("email")
    if not email:
        userinfo = await oauth.oidc.parse_id_token(request, token)
        email = userinfo.get(claim) or userinfo.get("email")
    email = str(email or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="ID token has no email")
    if not is_platform_admin(db, email):
        existing_user = db.scalar(select(User).where(User.email == email))
        if existing_user and existing_user.status != "active":
            request.session.clear()
            return RedirectResponse("/login?error=disabled", status_code=303)
    request.session["email"] = email
    request.session["name"] = userinfo.get("name") or email
    next_url = request.session.pop("next", "/admin")
    if not is_platform_admin(db, email):
        return RedirectResponse("/my", status_code=303)
    return RedirectResponse(safe_next(next_url), status_code=303)


@app.get("/auth/logout", include_in_schema=False)
def auth_logout(request: Request):
    request.session.clear()
    return RedirectResponse("/login", status_code=303)


# ---------------------------------------------------------------------------
# Direct Sandbox Open & Workspace Backup
# ---------------------------------------------------------------------------


@app.get("/sandboxes/{sandbox_id}/open", include_in_schema=False)
def open_sandbox_with_token(
    sandbox_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    sandbox = load_sandbox(db, sandbox_id)
    email = session_email(request)
    is_admin = _is_authenticated_admin(request, db)
    if (
        (not is_admin and sandbox.user.email.lower() != email)
        or (not is_admin and sandbox.user.status != "active")
    ):
        return verify_sandbox_access(sandbox.slug, request, db)
    base = settings.sandbox_url(sandbox.slug).rstrip("/")
    raw_launch = get_docker().launch_token_url(sandbox)
    if raw_launch:
        parsed = urlsplit(raw_launch)
        if parsed.query:
            return RedirectResponse(f"{base}/dsh/?{parsed.query}", status_code=302)
    return RedirectResponse(f"{base}/", status_code=302)


@app.get("/api/sandboxes/{sandbox_id}/backup")
@app.get("/sandboxes/{sandbox_id}/backup", include_in_schema=False)
def backup_sandbox_workspace(
    sandbox_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    sandbox = load_sandbox(db, sandbox_id)
    email = session_email(request)
    if not _is_authenticated_admin(request, db):
        if not email:
            raise HTTPException(status_code=401, detail="请先登录")
        if sandbox.user.email.lower() != email:
            raise HTTPException(status_code=403, detail="无权备份他人的工作区")
        if sandbox.user.status != "active":
            raise HTTPException(status_code=403, detail="该账号已被管理员禁用")
    try:
        stream = get_docker().export_workspace_tar(sandbox)
    except Exception as exc:
        raise _manager_error(exc) from exc
    filename = f"{sandbox.slug}-home.tar"
    return StreamingResponse(
        stream,
        media_type="application/x-tar",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# User Portal API (/api/my/*) — Read / Start / Stop / Backup only (No Create!)
# ---------------------------------------------------------------------------


@app.get("/api/my/sandboxes", response_model=SandboxList)
def api_my_sandboxes(
    request: Request,
    email: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    sess_email = session_email(request)
    is_admin = _is_authenticated_admin(request, db)
    if not sess_email and not is_admin:
        return SandboxList(items=[])
    target_email = (email or sess_email or "").strip().lower()
    if not is_admin:
        target_email = sess_email
        _ensure_active_user(db, sess_email)
    if not target_email:
        return SandboxList(items=[])
    sandboxes = list(
        db.scalars(
            select(Sandbox)
            .join(Sandbox.user)
            .options(joinedload(Sandbox.user), joinedload(Sandbox.llm_profile))
            .where(Sandbox.deleted_at.is_(None), User.email == target_email)
            .order_by(Sandbox.created_at)
        ).all()
    )
    return SandboxList(items=[sandbox_out(s) for s in sandboxes])


@app.post("/api/my/password")
def api_change_my_password(
    payload: UserPasswordChange,
    request: Request,
    db: Session = Depends(get_db),
):
    if settings.manager_auth_mode == "oidc":
        raise HTTPException(
            status_code=400,
            detail="当前已启用企业 OIDC 登录，请前往统一身份认证平台修改密码",
        )
    email = require_user_api(request)
    user = _ensure_active_user(db, email)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="当前账号仅使用平台管理员配置，无独立用户密码记录",
        )
    if user.password_hash:
        if not payload.current_password or not verify_password(
            payload.current_password, user.password_hash
        ):
            raise HTTPException(status_code=401, detail="当前密码错误")
    user.password_hash = hash_password(payload.new_password)
    audit(db, "user.password_change", target=user.email, actor=email)
    db.commit()
    return {"ok": True}


@app.post("/api/my/sandboxes/{sandbox_id}/{action}", response_model=SandboxOut)
def api_my_sandbox_action(
    sandbox_id: str,
    action: str,
    request: Request,
    db: Session = Depends(get_db),
):
    email = require_user_api(request)
    sandbox = load_sandbox(db, sandbox_id)
    if not _is_authenticated_admin(request, db):
        if sandbox.user.email.lower() != email:
            raise HTTPException(status_code=403, detail="无权操作他人的工作区")
        if sandbox.user.status != "active":
            raise HTTPException(status_code=403, detail="该账号已被管理员禁用")
    handlers = {
        "start": lambda: start_sandbox(db, get_docker(), sandbox_id),
        "stop": lambda: stop_sandbox(db, get_docker(), sandbox_id),
        "restart": lambda: restart_sandbox(db, get_docker(), sandbox_id),
    }
    if action not in handlers:
        raise HTTPException(status_code=404, detail="未知操作")
    try:
        updated = handlers[action]()
    except Exception as exc:
        raise _manager_error(exc) from exc
    return sandbox_out(updated)


# ---------------------------------------------------------------------------
# Platform Overview & Self-Hosted Plugins API
# ---------------------------------------------------------------------------


@app.get("/api/overview")
def api_overview(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    sandboxes = list(
        db.scalars(
            select(Sandbox).where(Sandbox.deleted_at.is_(None))
        ).all()
    )
    users_count = len(list(db.scalars(select(User)).all()))
    templates_count = len(list(db.scalars(select(SandboxTemplate)).all()))
    plugins = get_plugin_registry().list_packages()
    recent_audits = list(
        db.scalars(
            select(AuditLog).order_by(AuditLog.created_at.desc()).limit(25)
        ).all()
    )
    running_count = sum(1 for s in sandboxes if s.status == "running")
    allocated_cpus = sum(
        (s.cpu_limit if s.cpu_limit is not None else settings.sandbox_cpus)
        for s in sandboxes
    )
    return {
        "total_sandboxes": len(sandboxes),
        "running_sandboxes": running_count,
        "stopped_sandboxes": len(sandboxes) - running_count,
        "allocated_cpus": round(allocated_cpus, 2),
        "users_count": users_count,
        "templates_count": templates_count,
        "plugins_count": len(plugins),
        "default_image_repo": settings.dsh_image_repo,
        "default_image_tag": settings.dsh_image_tag,
        "default_cpus": settings.sandbox_cpus,
        "default_memory": settings.sandbox_memory,
        "manager_auth_mode": settings.manager_auth_mode,
        "plugin_index_url": settings.plugin_index_url,
        "local_images": get_docker().list_local_images(),
        "audit_logs": [
            {
                "id": a.id,
                "actor": a.actor,
                "action": a.action,
                "target": a.target,
                "detail": a.detail,
                "created_at": a.created_at.isoformat(),
            }
            for a in recent_audits
        ],
    }


@app.get("/api/plugins")
def api_plugins(
    _: None = Depends(require_admin_api),
):
    base_url = settings.manager_base_url
    packages = get_plugin_registry().list_packages()
    index_doc = get_plugin_registry().build_index(base_url)
    index_by_name = {
        entry.get("name"): entry for entry in index_doc.get("plugins", [])
    }
    items = []
    for pkg in packages:
        entry = index_by_name.get(pkg.name) or {}
        title_obj = entry.get("title") or {}
        desc_obj = entry.get("description") or {}
        items.append(
            {
                "slug": pkg.slug,
                "package_name": pkg.name,
                "version": pkg.version,
                "display_name_zh": (
                    title_obj.get("zh") if isinstance(title_obj, dict) else pkg.name
                )
                or pkg.name,
                "display_name_en": (
                    title_obj.get("en") if isinstance(title_obj, dict) else pkg.name
                )
                or pkg.name,
                "description_zh": (
                    desc_obj.get("zh")
                    if isinstance(desc_obj, dict)
                    else pkg.description
                )
                or pkg.description,
                "description_en": (
                    desc_obj.get("en")
                    if isinstance(desc_obj, dict)
                    else pkg.description
                )
                or pkg.description,
                "author": entry.get("author") or "DSH Sandbox Platform",
                "category": (entry.get("categories") or ["utility"])[0],
                "icon_url": f"{base_url}/plugins/icons/{pkg.slug}.svg",
                "tarball_url": f"{base_url}/plugins/packages/{pkg.slug}.tgz",
                "npm_packument_url": f"{base_url}/plugins/npm/{pkg.name}",
                "install_command": f"dsh plugin --profile web add {base_url}/plugins/packages/{pkg.slug}.tgz",
            }
        )
    return {
        "index_url": f"{base_url}/plugins/index.json",
        "npm_registry_url": f"{base_url}/plugins/npm",
        "source_type": settings.plugin_source_type,
        "auto_install_default": settings.sandbox_auto_install_plugins,
        "items": items,
    }


@app.post("/api/plugins/sync-sandboxes")
def api_sync_plugins_to_sandboxes(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    sandboxes = list(
        db.scalars(select(Sandbox).where(Sandbox.deleted_at.is_(None))).all()
    )
    results = []
    for sbx in sandboxes:
        try:
            res = get_docker().sync_plugin_market(sbx)
            results.append(res)
        except Exception as exc:
            results.append({"slug": sbx.slug, "ok": False, "detail": str(exc)})
    return {"synced": len([r for r in results if r.get("ok")]), "results": results}


# ---------------------------------------------------------------------------
# Templates CRUD API (/api/templates)
# ---------------------------------------------------------------------------


@app.get("/api/templates", response_model=list[TemplateOut])
def api_list_templates(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    return list_templates(db)


@app.post("/api/templates", response_model=TemplateOut, status_code=201)
def api_create_template(
    payload: TemplateCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    try:
        return create_template(db, payload)
    except Exception as exc:
        raise _manager_error(exc) from exc


@app.put("/api/templates/{template_id}", response_model=TemplateOut)
def api_update_template(
    template_id: str,
    payload: TemplateUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    try:
        return update_template(db, template_id, payload)
    except Exception as exc:
        raise _manager_error(exc) from exc


@app.delete("/api/templates/{template_id}")
def api_delete_template(
    template_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    try:
        delete_template(db, template_id)
        return {"ok": True}
    except Exception as exc:
        raise _manager_error(exc) from exc


# ---------------------------------------------------------------------------
# Users & Admins API
# ---------------------------------------------------------------------------


@app.post("/api/users", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="该邮箱用户已存在")
    pw_hash = hash_password(payload.password) if payload.password else None
    user = User(
        email=email,
        display_name=payload.display_name,
        password_hash=pw_hash,
        role=payload.role,
    )
    db.add(user)
    try:
        db.flush()
        audit(
            db,
            "user.create",
            target=email,
            detail=f"has_password={bool(pw_hash)}",
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="该邮箱用户已存在") from exc
    db.refresh(user)
    return _user_out(user, 0)


@app.get("/api/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    users = list(db.scalars(select(User).order_by(User.email)).all())
    counts_rows = db.execute(
        select(Sandbox.user_id, func.count(Sandbox.id))
        .where(Sandbox.deleted_at.is_(None))
        .group_by(Sandbox.user_id)
    ).all()
    counts = {row[0]: int(row[1]) for row in counts_rows}
    return [_user_out(u, counts.get(u.id, 0)) for u in users]


@app.patch("/api/users/{user_id}", response_model=UserOut)
def update_user_endpoint(
    user_id: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    changes: list[str] = []
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip() or None
        changes.append("display_name")
    if payload.status is not None and payload.status != user.status:
        user.status = payload.status
        changes.append(f"status={payload.status}")
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
        changes.append("password_reset")
    if changes:
        audit(db, "user.update", target=user.email, detail=",".join(changes))
    db.commit()
    db.refresh(user)
    cnt = db.scalar(
        select(func.count(Sandbox.id)).where(
            Sandbox.user_id == user.id, Sandbox.deleted_at.is_(None)
        )
    )
    return _user_out(user, int(cnt or 0))


@app.delete("/api/users/{user_id}")
def delete_user_endpoint(
    user_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    active_sbx = db.scalar(
        select(Sandbox).where(
            Sandbox.user_id == user_id, Sandbox.deleted_at.is_(None)
        )
    )
    if active_sbx:
        raise HTTPException(
            status_code=409,
            detail=f"该用户仍有运行中的沙箱 ({active_sbx.slug})，请先删除沙箱",
        )
    # Remove soft-deleted sandbox tombstones before deleting the user row.
    for old_sbx in db.scalars(
        select(Sandbox).where(Sandbox.user_id == user_id, Sandbox.deleted_at.is_not(None))
    ).all():
        db.delete(old_sbx)
    audit(db, "user.delete", target=user.email)
    db.delete(user)
    db.commit()
    return {"ok": True}


@app.get("/api/admins", response_model=list[AdminOut])
def list_admins(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    return list_platform_admins(db)


@app.post("/api/admins", response_model=AdminOut, status_code=201)
def add_admin(
    payload: AdminCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    return add_platform_admin(
        db, str(payload.email), payload.display_name
    )


@app.delete("/api/admins/{email}", response_model=AdminOut)
def remove_admin(
    email: str,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    if email.lower() == session_email(request):
        raise HTTPException(status_code=400, detail="不能停用当前登录的管理员账号")
    try:
        return deactivate_platform_admin(db, email)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# LLM profiles
# ---------------------------------------------------------------------------


@app.post("/api/llm-profiles", response_model=LlmProfileOut, status_code=201)
def create_profile(
    payload: LlmProfileCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    profile = create_llm_profile(
        db,
        name=payload.name,
        base_url=payload.base_url,
        model=payload.model,
        ciphertext=encrypt_secret(payload.api_key),
    )
    return profile


@app.get("/api/llm-profiles", response_model=list[LlmProfileOut])
def list_profiles(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    return list(db.scalars(select(LlmProfile).order_by(LlmProfile.name)).all())


@app.delete("/api/llm-profiles/{profile_id}")
def delete_profile(
    profile_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    profile = db.get(LlmProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="LLM 配置不存在")
    for sbx in db.scalars(
        select(Sandbox).where(Sandbox.llm_profile_id == profile_id)
    ).all():
        sbx.llm_profile_id = None
    db.delete(profile)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Sandboxes API (Admin-Only Creation & Lifecycle Management)
# ---------------------------------------------------------------------------


@app.post("/api/sandboxes", response_model=SandboxOut, status_code=201)
def create_sandbox_endpoint(
    payload: SandboxCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    try:
        sandbox = create_sandbox(
            db,
            settings,
            get_docker(),
            email=str(payload.email),
            slug=payload.slug,
            display_name=payload.display_name,
            image_repo=payload.image_repo,
            image_tag=payload.image_tag,
            cpu_limit=payload.cpu_limit,
            memory_limit=payload.memory_limit,
            llm_profile_id=payload.llm_profile_id,
            template=payload.template,
            init_repo_url=payload.init_repo_url,
            init_script=payload.init_script,
            auto_install_plugins=payload.auto_install_plugins,
            initial_password=payload.initial_password,
        )
    except Exception as exc:
        raise _manager_error(exc) from exc
    return sandbox_out(sandbox)


@app.get("/api/sandboxes", response_model=SandboxList)
def list_sandboxes(
    include_deleted: bool = False,
    refresh: bool = False,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    query = select(Sandbox).options(
        joinedload(Sandbox.user), joinedload(Sandbox.llm_profile)
    )
    if not include_deleted:
        query = query.where(Sandbox.deleted_at.is_(None))
    sandboxes = list(db.scalars(query.order_by(Sandbox.created_at)).all())
    if refresh:
        docker = get_docker()
        for sandbox in sandboxes:
            refresh_status(db, docker, sandbox)
    return SandboxList(items=[sandbox_out(sandbox) for sandbox in sandboxes])


@app.get("/api/sandboxes/{sandbox_id}", response_model=SandboxOut)
def get_sandbox(
    sandbox_id: str,
    refresh: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    try:
        sandbox = load_sandbox(db, sandbox_id)
    except NotFoundError as exc:
        raise _manager_error(exc) from exc
    if refresh:
        refresh_status(db, get_docker(), sandbox)
    return sandbox_out(sandbox)


@app.post("/api/sandboxes/{sandbox_id}/start", response_model=SandboxOut)
def start_sandbox_endpoint(
    sandbox_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    try:
        sandbox = start_sandbox(db, get_docker(), sandbox_id)
    except Exception as exc:
        raise _manager_error(exc) from exc
    return sandbox_out(sandbox)


@app.post("/api/sandboxes/{sandbox_id}/stop", response_model=SandboxOut)
def stop_sandbox_endpoint(
    sandbox_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    try:
        sandbox = stop_sandbox(db, get_docker(), sandbox_id)
    except Exception as exc:
        raise _manager_error(exc) from exc
    return sandbox_out(sandbox)


@app.post("/api/sandboxes/{sandbox_id}/restart", response_model=SandboxOut)
def restart_sandbox_endpoint(
    sandbox_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    try:
        sandbox = restart_sandbox(db, get_docker(), sandbox_id)
    except Exception as exc:
        raise _manager_error(exc) from exc
    return sandbox_out(sandbox)


@app.post("/api/sandboxes/{sandbox_id}/recreate", response_model=SandboxOut)
def recreate_sandbox_endpoint(
    sandbox_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    try:
        sandbox = load_sandbox(db, sandbox_id)
        get_docker().recreate(sandbox)
        sandbox.status = "running"
        sandbox.last_seen_at = sandbox.updated_at
        audit(db, "sandbox.recreate", target=sandbox.id)
        db.commit()
        db.refresh(sandbox)
    except Exception as exc:
        raise _manager_error(exc) from exc
    return sandbox_out(sandbox)


@app.patch("/api/sandboxes/{sandbox_id}", response_model=SandboxOut)
def patch_sandbox(
    sandbox_id: str,
    payload: SandboxPatch,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    if (
        payload.image_repo is None
        and payload.image_tag is None
        and payload.llm_profile_id is None
        and payload.cpu_limit is None
        and payload.memory_limit is None
    ):
        raise HTTPException(status_code=400, detail="nothing to update")
    try:
        sandbox = load_sandbox(db, sandbox_id)
        need_recreate = False
        if payload.llm_profile_id is not None:
            if payload.llm_profile_id == "":
                sandbox.llm_profile_id = None
            else:
                if not db.get(LlmProfile, payload.llm_profile_id):
                    raise HTTPException(status_code=404, detail="llm profile not found")
                sandbox.llm_profile_id = payload.llm_profile_id
            db.commit()
            need_recreate = True
        if payload.image_repo is not None and payload.image_repo != sandbox.image_repo:
            sandbox.image_repo = payload.image_repo.strip()
            db.commit()
            need_recreate = True
        if payload.cpu_limit is not None or payload.memory_limit is not None:
            sandbox = update_sandbox_limits(
                db,
                get_docker(),
                sandbox_id,
                payload.cpu_limit
                if payload.cpu_limit is not None
                else sandbox.cpu_limit,
                payload.memory_limit
                if payload.memory_limit is not None
                else sandbox.memory_limit,
            )
        if payload.image_tag is not None and payload.image_tag != sandbox.image_tag:
            sandbox = upgrade_sandbox(
                db, get_docker(), sandbox_id, payload.image_tag
            )
            need_recreate = False
        if need_recreate:
            get_docker().recreate(sandbox)
            sandbox.status = "running"
            db.commit()
            db.refresh(sandbox)
    except HTTPException:
        raise
    except Exception as exc:
        raise _manager_error(exc) from exc
    return sandbox_out(sandbox)


@app.delete("/api/sandboxes/{sandbox_id}", response_model=SandboxOut)
def delete_sandbox_endpoint(
    sandbox_id: str,
    purge_volume: bool = False,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin_api),
):
    try:
        sandbox = delete_sandbox(db, get_docker(), sandbox_id, purge_volume)
    except Exception as exc:
        raise _manager_error(exc) from exc
    return sandbox_out(sandbox)


@app.get("/api/sandboxes/{sandbox_id}/logs")
@app.get("/api/my/sandboxes/{sandbox_id}/logs")
def sandbox_logs(
    sandbox_id: str,
    request: Request,
    tail: int = Query(default=300, ge=1, le=5000),
    db: Session = Depends(get_db),
):
    try:
        sandbox = load_sandbox(db, sandbox_id, include_deleted=True)
        if not _is_authenticated_admin(request, db):
            email = session_email(request)
            if not email:
                raise HTTPException(status_code=401, detail="请先登录")
            if sandbox.user.email.lower() != email:
                raise HTTPException(status_code=403, detail="无权查看他人的工作区日志")
            if sandbox.user.status != "active":
                raise HTTPException(status_code=403, detail="该账号已被管理员禁用")
        return {"logs": get_docker().logs(sandbox, tail=tail)}
    except HTTPException:
        raise
    except Exception as exc:
        raise _manager_error(exc) from exc


@app.get("/api/sandboxes/{sandbox_id}/stats")
def sandbox_stats(
    sandbox_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        sandbox = load_sandbox(db, sandbox_id)
        if not _is_authenticated_admin(request, db):
            email = session_email(request)
            if not email:
                raise HTTPException(status_code=401, detail="请先登录")
            if sandbox.user.email.lower() != email:
                raise HTTPException(status_code=403, detail="无权查看他人的工作区状态")
            if sandbox.user.status != "active":
                raise HTTPException(status_code=403, detail="该账号已被管理员禁用")
        return get_docker().stats(sandbox)
    except HTTPException:
        raise
    except Exception as exc:
        raise _manager_error(exc) from exc


# ---------------------------------------------------------------------------
# React + shadcn/ui SPA Entry Routes
# ---------------------------------------------------------------------------


def _serve_spa():
    index_file = WEB_DIST_DIR / "index.html"
    if index_file.is_file():
        return FileResponse(str(index_file), media_type="text/html")
    return HTMLResponse(
        "<h1>DSH Manager Frontend not built yet</h1><p>Run <code>yarn build</code> in <code>manager/frontend</code>.</p>",
        status_code=503,
    )


@app.get("/", include_in_schema=False)
@app.get("/login", include_in_schema=False)
@app.get("/auth/login", include_in_schema=False)
@app.get("/admin", include_in_schema=False)
@app.get("/my", include_in_schema=False)
def spa_routes():
    return _serve_spa()
