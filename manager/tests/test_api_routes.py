from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest


def test_lifespan_startup_validation(monkeypatch):
    import app.main as main_mod

    orig_secret = main_mod.settings.secret_key
    orig_mode = main_mod.settings.manager_auth_mode
    orig_token = main_mod.settings.manager_admin_token
    orig_issuer = main_mod.settings.oidc_issuer_url
    orig_discovery = main_mod.settings.oidc_discovery_url
    orig_cid = main_mod.settings.oidc_client_id
    orig_csec = main_mod.settings.oidc_client_secret

    async def run_lifespan():
        async with main_mod.lifespan(main_mod.app):
            pass

    try:
        monkeypatch.setattr(main_mod.settings, "secret_key", "change-me-in-production")
        with pytest.raises(RuntimeError, match="SECRET_KEY"):
            asyncio.run(run_lifespan())

        monkeypatch.setattr(main_mod.settings, "secret_key", orig_secret)
        monkeypatch.setattr(main_mod.settings, "manager_auth_mode", "token")
        monkeypatch.setattr(main_mod.settings, "manager_admin_token", "")
        with pytest.raises(RuntimeError, match="MANAGER_ADMIN_TOKEN"):
            asyncio.run(run_lifespan())

        monkeypatch.setattr(main_mod.settings, "manager_auth_mode", "oidc")
        monkeypatch.setattr(main_mod.settings, "oidc_issuer_url", "")
        monkeypatch.setattr(main_mod.settings, "oidc_discovery_url", "")
        monkeypatch.setattr(main_mod.settings, "oidc_client_id", "")
        monkeypatch.setattr(main_mod.settings, "oidc_client_secret", "")
        with pytest.raises(RuntimeError, match="MANAGER_AUTH_MODE=oidc requires"):
            asyncio.run(run_lifespan())
    finally:
        monkeypatch.setattr(main_mod.settings, "secret_key", orig_secret)
        monkeypatch.setattr(main_mod.settings, "manager_auth_mode", orig_mode)
        monkeypatch.setattr(main_mod.settings, "manager_admin_token", orig_token)
        monkeypatch.setattr(main_mod.settings, "oidc_issuer_url", orig_issuer)
        monkeypatch.setattr(main_mod.settings, "oidc_discovery_url", orig_discovery)
        monkeypatch.setattr(main_mod.settings, "oidc_client_id", orig_cid)
        monkeypatch.setattr(main_mod.settings, "oidc_client_secret", orig_csec)


def test_public_endpoints_and_plugins_registry(api_env):
    client, _fake_docker, _registry = api_env

    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok", "docker": "ok"}

    idx = client.get("/plugins/index.json")
    assert idx.status_code == 200
    assert idx.json()["plugins"][0]["name"] == "@local/dsh-plugin-sample-tool"

    tgz = client.get("/plugins/packages/sample-tool.tgz")
    assert tgz.status_code == 200
    assert 'filename="sample-tool-1.2.3.tgz"' in tgz.headers["content-disposition"]

    pack = client.get("/plugins/npm/@local/dsh-plugin-sample-tool")
    assert pack.status_code == 200
    assert pack.json()["dist-tags"]["latest"] == "1.2.3"

    icon = client.get("/plugins/icons/sample-tool.svg")
    assert icon.status_code == 200
    assert "<svg" in icon.text

    assert client.get("/plugins/packages/missing.tgz").status_code == 404
    assert client.get("/plugins/icons/missing.svg").status_code == 404


def test_token_auth_admin_crud_backup_and_user_portal(api_env):
    client, _fake_docker, _registry = api_env
    admin_headers = {"Authorization": "Bearer test-admin-token"}

    # Unauthenticated check
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["authenticated"] is False

    # Create LLM profile, custom template, user, secondary admin
    llm_res = client.post(
        "/api/llm-profiles",
        headers=admin_headers,
        json={
            "name": "DeepSeek",
            "base_url": "https://api.deepseek.com/v1",
            "model": "deepseek-chat",
            "api_key": "sk-secret",
        },
    )
    assert llm_res.status_code == 201
    assert "api_key" not in llm_res.json()
    llm_id = llm_res.json()["id"]

    tpl_res = client.post(
        "/api/templates",
        headers=admin_headers,
        json={
            "key": "gpu-box",
            "name": "GPU Box",
            "default_cpu_limit": 4.0,
            "default_memory_limit": "8g",
        },
    )
    assert tpl_res.status_code == 201
    assert len(client.get("/api/templates", headers=admin_headers).json()) >= 2

    user_res = client.post(
        "/api/users",
        headers=admin_headers,
        json={
            "email": "alice@example.com",
            "display_name": "Alice",
            "password": "alice-password-123",
        },
    )
    assert user_res.status_code == 201
    assert user_res.json()["has_password"] is True
    alice_id = user_res.json()["id"]

    # Second admin + deactivate
    adm_res = client.post(
        "/api/admins",
        headers=admin_headers,
        json={"email": "ops@example.com", "display_name": "Ops"},
    )
    assert adm_res.status_code == 201
    assert client.delete("/api/admins/ops@example.com", headers=admin_headers).status_code == 200

    # Create sandbox for alice and bob
    alice_sbx = client.post(
        "/api/sandboxes",
        headers=admin_headers,
        json={
            "email": "alice@example.com",
            "display_name": "Alice",
            "llm_profile_id": llm_id,
            "template": "agent-os",
        },
    )
    assert alice_sbx.status_code == 201
    alice_sbx_id = alice_sbx.json()["id"]
    assert alice_sbx.json()["slug"] == "alice"

    bob_sbx = client.post(
        "/api/sandboxes",
        headers=admin_headers,
        json={"email": "bob@example.com", "initial_password": "bob-password-123"},
    )
    assert bob_sbx.status_code == 201
    bob_sbx_id = bob_sbx.json()["id"]

    # Admin operations: logs, stats, backup, limits, recreate, sync-sandboxes
    assert (
        client.get(f"/api/sandboxes/{alice_sbx_id}/logs", headers=admin_headers)
        .json()["logs"]
        .startswith("[alice]")
    )
    assert (
        client.get(f"/api/sandboxes/{alice_sbx_id}/stats", headers=admin_headers).json()[
            "cpu_percent"
        ]
        == 12.5
    )

    backup = client.get(f"/api/sandboxes/{alice_sbx_id}/backup", headers=admin_headers)
    assert backup.status_code == 200
    assert 'filename="alice-home.tar"' in backup.headers["content-disposition"]
    assert backup.content == b"fake-tar-chunk-1fake-tar-chunk-2"

    patched = client.patch(
        f"/api/sandboxes/{alice_sbx_id}",
        headers=admin_headers,
        json={"cpu_limit": 4.0, "memory_limit": "8g", "image_tag": "next"},
    )
    assert patched.status_code == 200
    assert patched.json()["cpu_limit"] == 4.0
    assert patched.json()["image_tag"] == "next"

    recreated = client.post(
        f"/api/sandboxes/{alice_sbx_id}/recreate",
        headers=admin_headers,
    )
    assert recreated.status_code == 200
    assert recreated.json()["status"] == "running"

    synced = client.post("/api/plugins/sync-sandboxes", headers=admin_headers, json={})
    assert synced.status_code == 200
    assert synced.json()["synced"] == 2

    overview = client.get("/api/overview", headers=admin_headers)
    assert overview.status_code == 200
    assert overview.json()["total_sandboxes"] == 2

    # ForwardAuth without login -> 401 JSON / 401 HTML
    assert client.get("/api/auth/verify-sandbox/alice").status_code == 401
    assert (
        client.get(
            "/api/auth/verify-sandbox/alice", headers={"Accept": "text/html"}
        ).status_code
        == 401
    )

    # Login as Alice with password
    bad_login = client.post(
        "/api/auth/login",
        json={"email": "alice@example.com", "password": "wrong", "mode": "user"},
    )
    assert bad_login.status_code == 401

    good_login = client.post(
        "/api/auth/login",
        json={"email": "alice@example.com", "password": "alice-password-123", "mode": "user"},
    )
    assert good_login.status_code == 200
    assert good_login.json()["admin"] is False

    # Verify sandbox ForwardAuth: Alice can access alice, cannot access bob, missing returns 404
    ok_verify = client.get("/api/auth/verify-sandbox/alice")
    assert ok_verify.status_code == 200
    assert ok_verify.headers["x-auth-request-email"] == "alice@example.com"
    assert ok_verify.headers["x-sandbox-owner"] == "alice@example.com"
    assert client.get("/api/auth/verify-sandbox/bob").status_code == 403
    assert client.get("/api/auth/verify-sandbox/does-not-exist").status_code == 404

    # Alice self-service portal only sees her own sandbox & cannot touch Bob's
    my_sbxs = client.get("/api/my/sandboxes").json()["items"]
    assert [s["slug"] for s in my_sbxs] == ["alice"]
    assert client.post(f"/api/my/sandboxes/{alice_sbx_id}/restart").status_code == 200
    assert client.post(f"/api/my/sandboxes/{bob_sbx_id}/restart").status_code == 403

    # Alice changes her own password
    pw_res = client.post(
        "/api/my/password",
        json={"current_password": "alice-password-123", "new_password": "alice-new-password-456"},
    )
    assert pw_res.status_code == 200
    client.post("/api/auth/logout")
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "alice@example.com", "password": "alice-new-password-456", "mode": "user"},
        ).status_code
        == 200
    )

    # Admin disables Alice -> Alice session immediately denied
    assert (
        client.patch(
            f"/api/users/{alice_id}",
            headers=admin_headers,
            json={"status": "disabled"},
        ).status_code
        == 200
    )
    assert client.get("/api/auth/verify-sandbox/alice").status_code == 403

    # Admin cannot deactivate self when signed in with session
    client.post("/api/auth/logout")
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "admin@example.com", "token": "test-admin-token"},
        ).status_code
        == 200
    )
    assert client.delete("/api/admins/admin@example.com").status_code == 400
    assert client.get("/api/auth/verify-sandbox/alice").status_code == 200
    open_resp = client.get(f"/sandboxes/{alice_sbx_id}/open", follow_redirects=False)
    assert open_resp.status_code == 302
    assert open_resp.headers["location"].endswith("/s/alice/")

    assert client.delete(f"/api/sandboxes/{alice_sbx_id}", headers=admin_headers).status_code == 200


def test_none_and_oidc_auth_modes(api_env, monkeypatch):
    client, _fake_docker, _registry = api_env
    import app.main as main_mod

    # Mode: none
    monkeypatch.setattr(main_mod.settings, "manager_auth_mode", "none")
    me = client.get("/api/auth/me").json()
    assert me["authenticated"] is True
    assert me["admin"] is True
    assert client.get("/api/overview").status_code == 200

    # Create a sandbox in 'none' mode so ForwardAuth resolves an existing slug in OIDC tests,
    # then clear the session cookie before switching to OIDC.
    created = client.post("/api/sandboxes", json={"email": "sso-user@example.com"})
    assert created.status_code == 201
    client.post("/api/auth/logout")

    # Mode: oidc
    monkeypatch.setattr(main_mod.settings, "manager_auth_mode", "oidc")
    monkeypatch.setattr(main_mod.settings, "oidc_email_claim", "email")
    monkeypatch.setattr(main_mod.settings, "oidc_client_id", "dsh-client")
    monkeypatch.setattr(main_mod.settings, "oidc_logout_url", "")
    monkeypatch.setattr(main_mod.settings, "oidc_issuer_url", "")
    monkeypatch.setattr(main_mod.settings, "oidc_discovery_url", "")

    redirect_calls: list[dict] = []

    async def fake_authorize_redirect(_request, redirect_uri, **kwargs):
        from fastapi.responses import RedirectResponse

        redirect_calls.append({"redirect_uri": redirect_uri, "kwargs": kwargs})
        return RedirectResponse(f"https://idp.example.com/auth?redirect_uri={redirect_uri}", status_code=302)

    async def fake_authorize_access_token(_request):
        return {
            "id_token": "fake-id-token-jwt",
            "userinfo": {"email": "sso-user@example.com", "name": "SSO User"},
        }

    async def fake_load_server_metadata():
        return {
            "end_session_endpoint": "https://idp.example.com/protocol/openid-connect/logout",
        }

    monkeypatch.setattr(
        main_mod.oauth,
        "oidc",
        SimpleNamespace(
            authorize_redirect=fake_authorize_redirect,
            authorize_access_token=fake_authorize_access_token,
            load_server_metadata=fake_load_server_metadata,
            server_metadata={},
        ),
        raising=False,
    )

    assert client.post("/api/auth/login", json={"email": "a@b.com", "token": "x"}).status_code == 400
    unauth_verify = client.get(
        "/api/auth/verify-sandbox/sso-user",
        headers={"Accept": "text/html"},
        follow_redirects=False,
    )
    assert unauth_verify.status_code == 401
    assert "/login" in unauth_verify.text
    start_res = client.get("/auth/oidc/start?next=/my", follow_redirects=False)
    assert start_res.status_code == 302
    assert "idp.example.com" in start_res.headers["location"]
    assert redirect_calls[-1]["kwargs"] == {}

    cb_res = client.get("/auth/callback", follow_redirects=False)
    assert cb_res.status_code == 303
    assert cb_res.headers["location"] == "/my"
    assert client.cookies.get("dsh_manager_id_token") == "fake-id-token-jwt"

    me_oidc = client.get("/api/auth/me").json()
    assert me_oidc["authenticated"] is True
    assert me_oidc["email"] == "sso-user@example.com"
    assert me_oidc["admin"] is False
    assert client.get("/api/auth/verify-sandbox/sso-user").status_code == 200

    # API logout clears local session + id_token and returns RP-Initiated Logout URL
    logout_res = client.post("/api/auth/logout")
    assert logout_res.status_code == 200
    logout_url = logout_res.json()["logout_url"]
    assert logout_url.startswith("https://idp.example.com/protocol/openid-connect/logout?")
    assert "id_token_hint=fake-id-token-jwt" in logout_url
    assert "client_id=dsh-client" in logout_url
    assert "post_logout_redirect_uri=" in logout_url
    assert "%2Flogin" in logout_url
    assert client.get("/api/auth/me").json()["authenticated"] is False
    assert client.get("/api/auth/verify-sandbox/sso-user").status_code == 401

    # Browser GET /auth/logout redirects to IdP logout URL and rewrites split-horizon internal origin
    monkeypatch.setattr(main_mod.settings, "oidc_discovery_url", "http://dsh-keycloak:8080/realms/main/.well-known/openid-configuration")
    monkeypatch.setattr(main_mod.settings, "oidc_issuer_url", "https://sso.example.com/realms/main")
    main_mod.oauth.oidc.server_metadata = {
        "end_session_endpoint": "http://dsh-keycloak:8080/realms/main/protocol/openid-connect/logout"
    }
    assert client.get("/auth/callback", follow_redirects=False).status_code == 303
    get_logout = client.get("/auth/logout", follow_redirects=False)
    assert get_logout.status_code == 303
    assert get_logout.headers["location"].startswith("https://sso.example.com/realms/main/protocol/openid-connect/logout?")
    assert client.get("/api/auth/me").json()["authenticated"] is False

    # Fallback when IdP lacks end_session_endpoint: next login forces prompt=login
    monkeypatch.setattr(main_mod.settings, "oidc_discovery_url", "")
    monkeypatch.setattr(main_mod.settings, "oidc_issuer_url", "")
    main_mod.oauth.oidc.server_metadata = {}

    async def empty_metadata():
        return {}

    main_mod.oauth.oidc.load_server_metadata = empty_metadata
    assert client.get("/auth/callback", follow_redirects=False).status_code == 303
    fallback_logout = client.post("/api/auth/logout")
    assert fallback_logout.status_code == 200
    assert fallback_logout.json()["logout_url"] is None
    assert client.get("/api/auth/me").json()["authenticated"] is False
    assert client.get("/auth/oidc/start", follow_redirects=False).status_code == 302
    assert redirect_calls[-1]["kwargs"] == {"prompt": "login"}

    # Explicit OIDC_LOGOUT_URL override
    monkeypatch.setattr(main_mod.settings, "oidc_logout_url", "https://custom-idp.example.com/v2/logout")
    assert client.get("/auth/callback", follow_redirects=False).status_code == 303
    override_logout = client.post("/api/auth/logout")
    assert override_logout.json()["logout_url"].startswith("https://custom-idp.example.com/v2/logout?")
