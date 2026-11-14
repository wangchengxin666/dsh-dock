from __future__ import annotations

import json
import re
import time
from pathlib import Path

_ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[@-_]")

import docker
import httpx
from docker.errors import APIError, ImageNotFound, NotFound
from docker.models.containers import Container

from .config import Settings
from .models import Sandbox
from .security import decrypt_secret


class SandboxRuntimeError(RuntimeError):
    pass


class DockerService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client: docker.DockerClient | None = None

    @property
    def client(self) -> docker.DockerClient:
        if self._client is None:
            self._client = docker.from_env()
        return self._client

    def image_for(
        self, tag: str | None = None, repo: str | None = None
    ) -> str:
        final_repo = (repo or self.settings.dsh_image_repo).strip()
        final_tag = (tag or self.settings.dsh_image_tag).strip()
        return f"{final_repo}:{final_tag}"

    def list_local_images(self) -> list[dict[str, str | float]]:
        items: list[dict[str, str | float]] = []
        try:
            for img in self.client.images.list():
                size_mb = round(int(img.attrs.get("Size") or 0) / (1024 * 1024), 1)
                short_id = (img.short_id or "").removeprefix("sha256:")
                for tag_full in img.tags or []:
                    if ":" in tag_full:
                        repo, tag = tag_full.rsplit(":", 1)
                    else:
                        repo, tag = tag_full, "latest"
                    items.append(
                        {
                            "full_name": tag_full,
                            "repo": repo,
                            "tag": tag,
                            "id": short_id,
                            "size_mb": size_mb,
                        }
                    )
        except Exception:
            pass
        return items

    def _ensure_network(self) -> None:
        try:
            self.client.networks.get(self.settings.dsh_network)
        except NotFound:
            self.client.networks.create(self.settings.dsh_network, driver="bridge")

    def _ensure_image(
        self, tag: str | None = None, repo: str | None = None
    ) -> None:
        image = self.image_for(tag, repo)
        try:
            self.client.images.get(image)
        except ImageNotFound as exc:
            if not self.settings.pull_missing_image:
                raise SandboxRuntimeError(
                    f"image {image} is not present; pull it or set PULL_MISSING_IMAGE=true"
                ) from exc
            self.client.images.pull(
                repo or self.settings.dsh_image_repo,
                tag=tag or self.settings.dsh_image_tag,
            )

    def container_name(self, sandbox: Sandbox) -> str:
        return f"dsh-sbx-{sandbox.slug}"

    def upstream_origin(self, sandbox: Sandbox) -> str:
        """Return http://<ip_or_container_name>:8080 reachable on DSH_NETWORK."""
        try:
            container = self.get(sandbox)
            container.reload()
            networks = (
                (container.attrs.get("NetworkSettings") or {}).get("Networks") or {}
            )
            address = networks.get(self.settings.dsh_network, {}).get("IPAddress")
            if address:
                return f"http://{address}:8080"
        except Exception:
            pass
        return f"http://{self.container_name(sandbox)}:8080"

    def health_url(self, sandbox: Sandbox) -> str:
        return f"{self.upstream_origin(sandbox)}/healthz"

    def _resolve_auto_install_plugins(self, raw_override: str | None = None) -> str:
        raw = (
            raw_override
            if raw_override is not None
            else self.settings.sandbox_auto_install_plugins
        ).strip()
        if not raw:
            return ""
        base = self.settings.sandbox_reachable_manager_url
        resolved: list[str] = []
        for item in raw.split(","):
            spec = item.strip()
            if not spec:
                continue
            if spec.startswith(("http://", "https://", "/")):
                resolved.append(spec)
            else:
                slug = spec.removesuffix(".tgz")
                resolved.append(f"{base}/plugins/packages/{slug}.tgz")
        return ",".join(resolved)

    def environment(self, sandbox: Sandbox) -> dict[str, str]:
        suffix = sandbox.slug.replace("-", "_")
        manager_url = self.settings.sandbox_reachable_manager_url
        base_path = f"/s/{sandbox.slug}"
        dsh_mount = f"{base_path}/dsh"
        public_origin = self.settings.manager_base_url
        public_base = f"{public_origin}{base_path}"
        dsh_public_url = f"{public_base}/dsh/"

        gw_host = self.settings.public_host_header
        gw_hostname = gw_host.split(":")[0]
        trusted_list = [gw_host]
        if gw_hostname and gw_hostname not in trusted_list:
            trusted_list.append(gw_hostname)
        for fallback in (
            f"{self.container_name(sandbox)}:8080",
            "127.0.0.1:8080",
            "localhost:8080",
        ):
            if fallback not in trusted_list:
                trusted_list.append(fallback)
        trusted_hosts = " ".join(trusted_list)

        env: dict[str, str] = {
            "SANDBOX_BASE_PATH": base_path,
            "SANDBOX_PUBLIC_ORIGIN": public_origin,
            "SANDBOX_PUBLIC_URL": f"{public_base}/",
            "DSH_MOUNT": dsh_mount,
            "DSH_PUBLIC_URL": dsh_public_url,
            "DSH_TRUSTED_HOSTS": trusted_hosts,
            "DSH_TOKEN_COOKIE_NAME": f"dsh_token_seen_{suffix}",
            "DSH_PERMISSION_MODE": self.settings.dsh_permission_mode,
            "DSH_PLUGIN_INDEX_URL": f"{manager_url}/plugins/index.json",
            "SANDBOX_TEMPLATE": sandbox.template or "agent-os",
            "TZ": self.settings.sandbox_timezone,
        }

        if sandbox.init_repo_url:
            env["SANDBOX_INIT_REPO_URL"] = sandbox.init_repo_url

        if sandbox.init_script:
            env["SANDBOX_INIT_SCRIPT"] = sandbox.init_script

        auto_plugins = self._resolve_auto_install_plugins(
            sandbox.auto_install_plugins
        )
        if auto_plugins:
            env["DSH_AUTO_INSTALL_PLUGINS"] = auto_plugins

        if sandbox.extra_env_json:
            try:
                parsed_env = json.loads(sandbox.extra_env_json)
                if isinstance(parsed_env, dict):
                    for k, v in parsed_env.items():
                        if k and v is not None:
                            env[str(k)] = str(v)
            except Exception:
                pass

        if sandbox.llm_profile is not None:
            env["DSH_DEFAULT_LLM_PROVIDER"] = "openai-compatible"
            env["DSH_DEFAULT_LLM_BASE_URL"] = sandbox.llm_profile.base_url
            env["DSH_DEFAULT_LLM_MODEL"] = sandbox.llm_profile.model
            try:
                api_key = decrypt_secret(sandbox.llm_profile.api_key_ciphertext)
                env["DSH_DEFAULT_LLM_API_KEY"] = api_key
            except ValueError:
                pass

        return env

    def create(self, sandbox: Sandbox) -> Container:
        self._ensure_network()
        self._ensure_image(sandbox.image_tag, sandbox.image_repo)
        volumes: dict[str, dict[str, str]] = {
            sandbox.volume_name: {"bind": "/home/workspace", "mode": "rw"}
        }
        if self.settings.custom_ca_bundle_path:
            ca_path = Path(self.settings.custom_ca_bundle_path)
            if ca_path.is_file():
                volumes[str(ca_path.resolve())] = {
                    "bind": "/etc/dsh/ca/custom-ca.crt",
                    "mode": "ro",
                }

        router_name = f"dsh-sbx-{sandbox.slug}"
        dsh_router_name = f"dsh-sbx-{sandbox.slug}-dsh"
        auth_mw = f"dsh-auth-{sandbox.slug}"
        verify_url = (
            f"{self.settings.sandbox_reachable_manager_url}"
            f"/api/auth/verify-sandbox/{sandbox.slug}"
        )
        # Protect ONLY DSH-related entrypoints (/s/<slug>/, /s/<slug>/_dsh-token, /s/<slug>/dsh/*).
        # User-exposed services (/s/<slug>/apps/*, /s/<slug>/p/*, etc.) remain open by default
        # so applications can implement their own authentication.
        dsh_rule = (
            f"Path(`/s/{sandbox.slug}`) || "
            f"Path(`/s/{sandbox.slug}/`) || "
            f"Path(`/s/{sandbox.slug}/_dsh-token`) || "
            f"Path(`/s/{sandbox.slug}/dsh`) || "
            f"PathPrefix(`/s/{sandbox.slug}/dsh/`)"
        )
        labels = {
            "dsh.managed": "true",
            "dsh.owner": sandbox.user.email,
            "dsh.slug": sandbox.slug,
            "dsh.volume": sandbox.volume_name,
            "dsh.template": sandbox.template or "agent-os",
            # Traefik automatic single-domain subpath discovery (/s/<slug>/...)
            "traefik.enable": "true",
            # Public router for user services (/s/<slug>/apps/*, /s/<slug>/p/*, healthz, etc.)
            f"traefik.http.routers.{router_name}.rule": f"PathPrefix(`/s/{sandbox.slug}`)",
            f"traefik.http.routers.{router_name}.entrypoints": "web",
            f"traefik.http.routers.{router_name}.priority": "100",
            f"traefik.http.routers.{router_name}.service": router_name,
            # Protected DSH router (owner & platform admin only via ForwardAuth)
            f"traefik.http.routers.{dsh_router_name}.rule": dsh_rule,
            f"traefik.http.routers.{dsh_router_name}.entrypoints": "web",
            f"traefik.http.routers.{dsh_router_name}.priority": "120",
            f"traefik.http.routers.{dsh_router_name}.service": router_name,
            f"traefik.http.routers.{dsh_router_name}.middlewares": f"{auth_mw}@docker",
            f"traefik.http.middlewares.{auth_mw}.forwardauth.address": verify_url,
            f"traefik.http.middlewares.{auth_mw}.forwardauth.trustForwardHeader": "true",
            f"traefik.http.middlewares.{auth_mw}.forwardauth.authResponseHeaders": (
                "X-Auth-Request-Email,X-Forwarded-User,X-Sandbox-Owner"
            ),
            f"traefik.http.services.{router_name}.loadbalancer.server.port": "8080",
        }

        return self.client.containers.run(
            self.image_for(sandbox.image_tag, sandbox.image_repo),
            name=self.container_name(sandbox),
            detach=True,
            volumes=volumes,
            environment=self.environment(sandbox),
            labels=labels,
            network=self.settings.dsh_network,
            restart_policy={"Name": "unless-stopped"},
            mem_limit=sandbox.memory_limit or self.settings.sandbox_memory,
            cpu_period=100_000,
            cpu_quota=int(
                (sandbox.cpu_limit or self.settings.sandbox_cpus) * 100_000
            ),
            pids_limit=512,
            security_opt=["no-new-privileges:true"],
            log_config={
                "Type": "json-file",
                "Config": {"max-size": "20m", "max-file": "3"},
            },
            init=True,
        )

    def update_limits(self, sandbox: Sandbox) -> None:
        container = self.get(sandbox)
        cpus = sandbox.cpu_limit or self.settings.sandbox_cpus
        try:
            container.update(
                mem_limit=sandbox.memory_limit or self.settings.sandbox_memory,
                cpu_period=100_000,
                cpu_quota=int(cpus * 100_000),
            )
        except APIError as exc:
            raise SandboxRuntimeError(f"limit update failed: {exc}") from exc

    def recreate(self, sandbox: Sandbox) -> None:
        """Recreate a container with the current image and limits, keeping volume."""
        self.remove(sandbox, purge_volume=False)
        sandbox.container_id = None
        container = self.create(sandbox)
        sandbox.container_id = container.id
        self.wait_healthy(sandbox)

    def wait_healthy(self, sandbox: Sandbox) -> None:
        deadline = time.monotonic() + self.settings.health_timeout_seconds
        url = self.health_url(sandbox)
        last_error: str | None = None
        with httpx.Client(timeout=2.0, trust_env=False) as http:
            while time.monotonic() < deadline:
                try:
                    response = http.get(url)
                    if response.status_code == 200:
                        return
                    last_error = f"HTTP {response.status_code}"
                except httpx.HTTPError as exc:
                    last_error = str(exc)
                time.sleep(1.0)
        raise SandboxRuntimeError(
            f"sandbox {sandbox.slug} did not become healthy at {url}: {last_error}"
        )

    def get(self, sandbox: Sandbox) -> Container:
        try:
            if sandbox.container_id:
                return self.client.containers.get(sandbox.container_id)
            return self.client.containers.get(self.container_name(sandbox))
        except NotFound as exc:
            raise SandboxRuntimeError(f"container for {sandbox.slug} not found") from exc

    def start(self, sandbox: Sandbox) -> str:
        container = self.get(sandbox)
        container.start()
        container.reload()
        return container.status

    def stop(self, sandbox: Sandbox) -> str:
        container = self.get(sandbox)
        container.stop(timeout=20)
        container.reload()
        return container.status

    def restart(self, sandbox: Sandbox) -> str:
        container = self.get(sandbox)
        container.restart(timeout=20)
        container.reload()
        return container.status

    def status(self, sandbox: Sandbox) -> str:
        try:
            container = self.get(sandbox)
            container.reload()
            return container.status
        except SandboxRuntimeError:
            return "missing"
        except APIError:
            return "unknown"

    def logs(self, sandbox: Sandbox, tail: int = 200) -> str:
        container = self.get(sandbox)
        raw = container.logs(tail=tail, timestamps=True)
        text = raw.decode("utf-8", errors="replace")
        text = _ANSI_ESCAPE_RE.sub("", text)
        text = text.replace("\u2009", " ").replace("\r\n", "\n").replace("\r", "\n")
        return text

    def launch_token_url(self, sandbox: Sandbox) -> str | None:
        """Extract the latest DSH launch URL with ?token=... from container logs if available."""
        try:
            log_text = self.logs(sandbox, tail=300)
        except Exception:
            return None
        for line in reversed(log_text.splitlines()):
            if "dsh web:" in line and "token=" in line:
                parts = line.split("dsh web:", 1)[1].strip().split()
                if parts:
                    return parts[0]
        return None

    def stats(self, sandbox: Sandbox) -> dict[str, float | int | str]:
        """Return live CPU % and memory usage for a running sandbox container."""
        container = self.get(sandbox)
        raw = container.stats(stream=False)
        mem_stats = raw.get("memory_stats") or {}
        mem_usage = int(mem_stats.get("usage") or 0)
        mem_limit = int(mem_stats.get("limit") or 0)

        cpu_stats = raw.get("cpu_stats") or {}
        precpu_stats = raw.get("precpu_stats") or {}
        cpu_delta = int(
            (cpu_stats.get("cpu_usage") or {}).get("total_usage", 0)
        ) - int((precpu_stats.get("cpu_usage") or {}).get("total_usage", 0))
        system_delta = int(cpu_stats.get("system_cpu_usage") or 0) - int(
            precpu_stats.get("system_cpu_usage") or 0
        )
        online_cpus = int(cpu_stats.get("online_cpus") or 1)
        cpu_percent = 0.0
        if system_delta > 0 and cpu_delta > 0:
            cpu_percent = round((cpu_delta / system_delta) * online_cpus * 100.0, 2)

        return {
            "cpu_percent": cpu_percent,
            "memory_usage_bytes": mem_usage,
            "memory_limit_bytes": mem_limit,
            "memory_usage_mb": round(mem_usage / (1024 * 1024), 1),
            "memory_limit_mb": round(mem_limit / (1024 * 1024), 1),
        }

    def export_workspace_tar(self, sandbox: Sandbox):
        """Stream a tar archive of /home/workspace from the sandbox container."""
        container = self.get(sandbox)
        bits, _stat = container.get_archive("/home/workspace")
        return bits

    def sync_plugin_market(
        self, sandbox: Sandbox, reinstall_plugins: list[str] | None = None
    ) -> dict[str, str | bool]:
        """Ensure DSH Plugin Market bundle & self-hosted index URL are active in a running sandbox."""
        container = self.get(sandbox)
        container.reload()
        if container.status != "running":
            return {"slug": sandbox.slug, "ok": False, "detail": f"status={container.status}"}

        index_url = f"{self.settings.sandbox_reachable_manager_url}/plugins/index.json"
        node_script = """
const fs = require('fs');
const indexUrl = process.env.INDEX_URL;
try { fs.rmSync('/home/workspace/.cache/pnpm', { recursive: true, force: true }); } catch {}
fs.mkdirSync('/home/workspace/.dsh-sandbox', { recursive: true });
fs.writeFileSync('/home/workspace/.dsh-sandbox/plugin-index-url.txt', indexUrl + '\\n');
const pkgPath = '/home/workspace/.dsh/profiles/web/package.json';
const patchPath = '/home/workspace/.dsh/profiles/web/cordis.patch.yml';
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.dsh = pkg.dsh || {};
  pkg.dsh.profile = pkg.dsh.profile || {};
  pkg.dsh.profile.bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : [];
  const bundle = '@deepseek-ai/dsh-experimental-plugin-market-bundle';
  if (!pkg.dsh.profile.bundles.includes(bundle)) {
    pkg.dsh.profile.bundles.push(bundle);
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\\n');
  }
}
if (fs.existsSync(patchPath)) {
  let content = fs.readFileSync(patchPath, 'utf8');
  content = content.replace(/^\\s*\\[\\]\\s*$/m, '');
  if (!content.includes('id: plugin-market')) {
    content = content.trimEnd() + '\\n\\n- id: plugin-market\\n  name: "@deepseek-ai/dsh-plugin-market"\\n  config:\\n    indexes:\\n      - ' + JSON.stringify(indexUrl) + '\\n';
    fs.writeFileSync(patchPath, content);
  } else if (!content.includes(indexUrl)) {
    content = content.replace(/(- id: plugin-market[\\s\\S]*?indexes:)\\s*\\[\\s*\\]/, '$1\\n      - ' + JSON.stringify(indexUrl));
    if (!content.includes(indexUrl)) {
      content = content.replace(/(- id: plugin-market[\\s\\S]*?indexes:)/, '$1\\n      - ' + JSON.stringify(indexUrl));
    }
    fs.writeFileSync(patchPath, content);
  }
}
"""
        ec1, out1 = container.exec_run(
            ["node", "-e", node_script],
            user="workspace",
            environment={"INDEX_URL": index_url, "HOME": "/home/workspace"},
        )
        if ec1 != 0:
            text1 = out1.decode("utf-8", errors="replace").strip() if out1 else ""
            return {"slug": sandbox.slug, "ok": False, "detail": text1[-300:]}

        if reinstall_plugins:
            for tgz_url in reinstall_plugins:
                container.exec_run(
                    ["dsh", "plugin", "--profile", "web", "add", tgz_url],
                    user="workspace",
                    environment={"HOME": "/home/workspace", "DSH_HOME": "/home/workspace/.dsh"},
                )

        ec2, out2 = container.exec_run(
            ["supervisorctl", "restart", "dsh"],
            user="root",
        )
        text = out2.decode("utf-8", errors="replace").strip() if out2 else ""
        return {
            "slug": sandbox.slug,
            "ok": ec2 == 0,
            "detail": text[-300:] if text else "synced",
        }

    def remove(self, sandbox: Sandbox, purge_volume: bool = False) -> None:
        try:
            container = self.get(sandbox)
            container.remove(force=True, v=False)
        except SandboxRuntimeError:
            pass
        except APIError as exc:
            raise SandboxRuntimeError(str(exc)) from exc

        if purge_volume:
            try:
                volume = self.client.volumes.get(sandbox.volume_name)
                volume.remove(force=True)
            except NotFound:
                pass
            except APIError as exc:
                raise SandboxRuntimeError(
                    f"container removed but volume cleanup failed: {exc}"
                ) from exc
