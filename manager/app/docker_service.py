from __future__ import annotations

import copy
import io
import json
import posixpath
import re
import tarfile
import tempfile
import time
from pathlib import Path, PurePosixPath
from typing import Any

_ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[@-_]")

import docker
import httpx
from docker.errors import APIError, ImageNotFound, NotFound
from docker.models.containers import Container

from .config import Settings
from .models import Sandbox
from .plugin_registry import PluginRegistryService
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
        registry = PluginRegistryService(self.settings)
        resolved: list[str] = []
        for item in raw.split(","):
            spec = item.strip()
            if not spec:
                continue
            if spec.startswith(("http://", "https://", "/", "@")):
                resolved.append(spec)
            else:
                slug = spec.removesuffix(".tgz")
                pkg = registry.get_by_slug_or_filename(slug)
                if pkg is not None:
                    resolved.append(pkg.name)
                else:
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
            "DSH_PLUGIN_NPM_REGISTRY": f"{manager_url}/plugins/npm",
            "SANDBOX_TEMPLATE": sandbox.template or "agent-os",
            "TZ": self.settings.sandbox_timezone,
        }

        if sandbox.init_repo_url:
            env["SANDBOX_INIT_REPO_URL"] = sandbox.init_repo_url

        if sandbox.init_script and sandbox.init_script.strip():
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
                "X-Auth-Request-Email,X-Forwarded-User,X-Sandbox-Owner,"
                "X-Auth-Request-Name,X-Auth-Request-Admin,X-Sandbox-Owner-Name"
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

    def _container_health_status(self, sandbox: Sandbox) -> str | None:
        try:
            container = self.get(sandbox)
            container.reload()
            state = container.attrs.get("State") if isinstance(container.attrs, dict) else None
            health = state.get("Health") if isinstance(state, dict) else None
            status = health.get("Status") if isinstance(health, dict) else None
            return status if isinstance(status, str) else None
        except Exception:
            return None

    def wait_healthy(self, sandbox: Sandbox) -> None:
        deadline = time.monotonic() + self.settings.health_timeout_seconds
        url = self.health_url(sandbox)
        last_error: str | None = None
        with httpx.Client(timeout=2.0, trust_env=False) as http:
            while time.monotonic() < deadline:
                try:
                    response = http.get(url)
                    if response.status_code == 200:
                        # Traefik excludes Docker containers while State.Health.Status == "starting".
                        if self._container_health_status(sandbox) != "starting":
                            return
                        last_error = "container healthcheck still starting"
                        time.sleep(0.5)
                        continue
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

    def workspace_disk_usage(self, sandbox: Sandbox) -> dict[str, float | int | None]:
        """Measure /home/workspace disk footprint and filesystem capacity inside a running sandbox."""
        empty: dict[str, float | int | None] = {
            "disk_usage_bytes": None,
            "disk_usage_mb": None,
            "disk_fs_total_mb": None,
            "disk_fs_avail_mb": None,
            "disk_fs_used_percent": None,
        }
        container = self.get(sandbox)
        container.reload()
        if container.status != "running":
            return empty
        try:
            ec, out = container.exec_run(
                [
                    "sh",
                    "-c",
                    "df -Pk /home/workspace 2>/dev/null | tail -n 1; "
                    "echo '---DU---'; "
                    "timeout 4 du -sk -x /home/workspace 2>/dev/null || true",
                ],
                user="root",
            )
        except Exception:
            return empty
        if ec != 0 or not out:
            return empty
        text = out.decode("utf-8", errors="replace")
        if "---DU---" not in text:
            return empty
        df_part, du_part = text.split("---DU---", 1)
        result = dict(empty)

        df_tokens = df_part.strip().split()
        if len(df_tokens) >= 5 and df_tokens[1].isdigit() and df_tokens[3].isdigit():
            total_kb = int(df_tokens[1])
            avail_kb = int(df_tokens[3])
            result["disk_fs_total_mb"] = round(total_kb / 1024, 1)
            result["disk_fs_avail_mb"] = round(avail_kb / 1024, 1)
            pct_raw = df_tokens[4].rstrip("%")
            if pct_raw.isdigit():
                result["disk_fs_used_percent"] = float(pct_raw)

        du_tokens = du_part.strip().split()
        if du_tokens and du_tokens[0].isdigit():
            used_bytes = int(du_tokens[0]) * 1024
            result["disk_usage_bytes"] = used_bytes
            result["disk_usage_mb"] = round(used_bytes / (1024 * 1024), 1)

        return result

    def has_active_work(self, sandbox: Sandbox) -> tuple[bool, str]:
        """Detect user background daemons or active agent child processes before auto-sleeping."""
        container = self.get(sandbox)
        container.reload()
        if container.status != "running":
            return False, "not-running"
        probe = (
            "if ls /home/workspace/.dsh-sandbox/services/conf.d/*.conf >/dev/null 2>&1; then "
            "echo ACTIVE:user-services; exit 0; fi; "
            "dsh_pid=$(pgrep -u workspace -f '/usr/local/bin/dsh ' | head -n 1); "
            "if [ -n \"$dsh_pid\" ] && ps -o pid=,comm= --ppid \"$dsh_pid\" 2>/dev/null "
            "| awk '$2 != \"tee\" && $2 != \"\" {found=1} END {exit !found}'; then "
            "echo ACTIVE:agent-subprocess; exit 0; fi; "
            "echo IDLE"
        )
        try:
            ec, out = container.exec_run(["sh", "-c", probe], user="root")
        except Exception:
            return False, "probe-skipped"
        text = out.decode("utf-8", errors="replace").strip() if out else ""
        if ec == 0 and text.startswith("ACTIVE:"):
            return True, text.split(":", 1)[1]
        return False, "idle"

    def stats(self, sandbox: Sandbox) -> dict[str, float | int | str | None]:
        """Return live CPU %, memory usage, and workspace disk stats for a running sandbox."""
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

        disk = self.workspace_disk_usage(sandbox)
        return {
            "cpu_percent": cpu_percent,
            "memory_usage_bytes": mem_usage,
            "memory_limit_bytes": mem_limit,
            "memory_usage_mb": round(mem_usage / (1024 * 1024), 1),
            "memory_limit_mb": round(mem_limit / (1024 * 1024), 1),
            **disk,
        }

    def export_workspace_tar(self, sandbox: Sandbox, exclude_caches: bool = False):
        """Stream a tar archive of /home/workspace from the sandbox container."""
        container = self.get(sandbox)
        if exclude_caches:
            container.reload()
            if container.status == "running":
                _ec, stream = container.exec_run(
                    [
                        "tar",
                        "--exclude=*/node_modules",
                        "--exclude=*/.venv",
                        "--exclude=*/venv",
                        "--exclude=*/__pycache__",
                        "--exclude=*/.cache",
                        "--exclude=*/.pnpm-store",
                        "--exclude=*/.npm",
                        "--exclude=*/logs/*.log",
                        "-cf",
                        "-",
                        "-C",
                        "/home",
                        "workspace",
                    ],
                    user="root",
                    stream=True,
                    demux=True,
                )

                def _stdout_chunks():
                    for stdout_chunk, _stderr_chunk in stream:
                        if stdout_chunk:
                            yield stdout_chunk

                return _stdout_chunks()
        bits, _stat = container.get_archive("/home/workspace")
        return bits

    def _sanitize_restore_member(self, member: tarfile.TarInfo) -> tarfile.TarInfo | None:
        """Normalize archive paths relative to /home/workspace and reject escapes/devices."""
        raw_name = member.name.replace("\\", "/")
        stripped = raw_name.lstrip("/")
        if raw_name.startswith("/"):
            raise SandboxRuntimeError(f"unsafe absolute archive path: {member.name}")
        parts = [p for p in PurePosixPath(stripped).parts if p not in ("", ".")]
        if any(p == ".." for p in parts):
            raise SandboxRuntimeError(f"unsafe archive path traversal: {member.name}")
        if parts and parts[0] == "workspace":
            parts = parts[1:]
        if not parts:
            return None
        rel = "/".join(parts)
        if member.isdev() or member.isfifo():
            raise SandboxRuntimeError(f"unsupported special file in backup: {member.name}")
        if member.issym() or member.islnk():
            target = member.linkname.replace("\\", "/")
            if target.startswith("/"):
                raise SandboxRuntimeError(f"unsafe link target in backup: {member.name} -> {target}")
            base = rel if member.islnk() else posixpath.dirname(rel)
            joined = posixpath.normpath(target if member.islnk() else posixpath.join(base, target))
            if joined == ".." or joined.startswith("../") or joined.startswith("/"):
                raise SandboxRuntimeError(f"link escapes workspace root: {member.name} -> {target}")
        cloned = copy.copy(member)
        cloned.name = rel
        cloned.uid = 1000
        cloned.gid = 1000
        cloned.uname = "workspace"
        cloned.gname = "workspace"
        return cloned

    def restore_workspace_tar(
        self,
        sandbox: Sandbox,
        archive_fileobj,
        mode: str = "merge",
    ) -> dict[str, int | bool]:
        """Validate and extract a tar/tar.gz backup into the sandbox /home/workspace."""
        if mode not in {"merge", "clean"}:
            raise SandboxRuntimeError(f"unsupported restore mode: {mode}")

        spooled = tempfile.SpooledTemporaryFile(max_size=16 * 1024 * 1024)
        restored_entries = 0
        try:
            archive_fileobj.seek(0)
            with tarfile.open(fileobj=archive_fileobj, mode="r:*") as src_tar:
                with tarfile.open(fileobj=spooled, mode="w") as dst_tar:
                    for member in src_tar:
                        clean_member = self._sanitize_restore_member(member)
                        if clean_member is None:
                            continue
                        extracted = src_tar.extractfile(member) if member.isfile() else None
                        dst_tar.addfile(clean_member, extracted)
                        restored_entries += 1
        except SandboxRuntimeError:
            spooled.close()
            raise
        except Exception as exc:
            spooled.close()
            raise SandboxRuntimeError(f"invalid tar archive: {exc}") from exc

        if restored_entries == 0:
            spooled.close()
            raise SandboxRuntimeError("backup archive contains no restorable workspace entries")

        container = self.get(sandbox)
        container.reload()
        was_running = container.status == "running"
        try:
            if was_running:
                container.exec_run(["supervisorctl", "stop", "dsh"], user="root")
                if mode == "clean":
                    container.exec_run(
                        [
                            "find",
                            "/home/workspace",
                            "-mindepth",
                            "1",
                            "-maxdepth",
                            "1",
                            "!",
                            "-name",
                            ".dsh-sandbox",
                            "-exec",
                            "rm",
                            "-rf",
                            "{}",
                            "+",
                        ],
                        user="root",
                    )
            spooled.seek(0)
            ok = container.put_archive("/home/workspace", spooled.read())
            if not ok:
                raise SandboxRuntimeError("docker put_archive returned failure")
            if was_running:
                container.exec_run(["chown", "-R", "workspace:workspace", "/home/workspace"], user="root")
                container.exec_run(["supervisorctl", "start", "dsh"], user="root")
                self.wait_healthy(sandbox)
        finally:
            spooled.close()

        return {"restored_entries": restored_entries, "restarted_dsh": was_running}

    def sync_plugin_market(
        self,
        sandbox: Sandbox,
        reinstall_plugins: list[str] | None = None,
        force_reinstall: bool = False,
    ) -> dict[str, Any]:
        """Ensure Plugin Market config and optionally force-reinstall built-in plugins in a sandbox."""
        container = self.get(sandbox)
        container.reload()
        if container.status != "running":
            return {"slug": sandbox.slug, "ok": False, "detail": f"status={container.status}"}

        manager_url = self.settings.sandbox_reachable_manager_url
        index_url = f"{manager_url}/plugins/index.json"
        npm_registry = f"{manager_url}/plugins/npm"
        registry = PluginRegistryService(self.settings)
        registry_packages = {pkg.name: pkg for pkg in registry.list_packages()}

        explicit_targets: list[str] = []
        for raw_spec in reinstall_plugins or []:
            spec = raw_spec.strip()
            if not spec:
                continue
            pkg = registry.get_by_package_name(spec) or registry.get_by_slug_or_filename(spec)
            explicit_targets.append(pkg.name if pkg else spec)

        node_script = """
const fs = require('fs');
const indexUrl = process.env.INDEX_URL;
const npmRegistry = process.env.NPM_REGISTRY || '';
try { fs.rmSync('/home/workspace/.cache/pnpm', { recursive: true, force: true }); } catch {}
fs.mkdirSync('/home/workspace/.dsh-sandbox', { recursive: true });
fs.writeFileSync('/home/workspace/.dsh-sandbox/plugin-index-url.txt', indexUrl + '\\n');
if (npmRegistry) {
  fs.writeFileSync('/home/workspace/.dsh-sandbox/plugin-npm-registry.txt', npmRegistry + '\\n');
}
const profileDir = '/home/workspace/.dsh/profiles/web';
const pkgPath = profileDir + '/package.json';
const patchPath = profileDir + '/cordis.patch.yml';
const npmrcPath = profileDir + '/.npmrc';
if (npmRegistry && fs.existsSync(profileDir)) {
  const existing = fs.existsSync(npmrcPath) ? fs.readFileSync(npmrcPath, 'utf8') : '';
  const lines = existing.split(/\\r?\\n/).filter((l) => l.trim() !== '' && !/^registry\\s*=/.test(l.trim()));
  lines.unshift('registry=' + npmRegistry);
  fs.writeFileSync(npmrcPath, lines.join('\\n') + '\\n');
}
let installedDeps = [];
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  installedDeps = Object.keys(pkg.dependencies || {});
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
console.log('INSTALLED_DEPS=' + JSON.stringify(installedDeps));
"""
        ec1, out1 = container.exec_run(
            ["node", "-e", node_script],
            user="workspace",
            environment={
                "INDEX_URL": index_url,
                "NPM_REGISTRY": npm_registry,
                "HOME": "/home/workspace",
            },
        )
        text1 = out1.decode("utf-8", errors="replace").strip() if out1 else ""
        if ec1 != 0:
            return {"slug": sandbox.slug, "ok": False, "detail": text1[-300:]}

        installed_deps: list[str] = []
        for line in text1.splitlines():
            if line.startswith("INSTALLED_DEPS="):
                try:
                    parsed = json.loads(line.split("=", 1)[1])
                    if isinstance(parsed, list):
                        installed_deps = [str(x) for x in parsed]
                except Exception:
                    pass

        targets_to_install = list(explicit_targets)
        if not targets_to_install and force_reinstall:
            configured = self._resolve_auto_install_plugins(sandbox.auto_install_plugins)
            configured_list = [x.strip() for x in configured.split(",") if x.strip()]
            installed_builtin = [name for name in installed_deps if name in registry_packages]
            seen_targets: set[str] = set()
            for item in [*installed_builtin, *configured_list]:
                if item not in seen_targets:
                    seen_targets.add(item)
                    targets_to_install.append(item)

        reinstalled: list[str] = []
        if targets_to_install:
            env = {
                "HOME": "/home/workspace",
                "DSH_HOME": "/home/workspace/.dsh",
                "npm_config_registry": npm_registry,
            }
            container.exec_run(
                [
                    "sh",
                    "-c",
                    "rm -rf /home/workspace/.dsh/profiles/web/.pnpm-store "
                    "/home/workspace/.local/share/pnpm/store /home/workspace/.cache/pnpm",
                ],
                user="workspace",
                environment=env,
            )
            to_remove = [p for p in targets_to_install if p in installed_deps]
            if to_remove:
                container.exec_run(
                    ["dsh", "plugin", "--profile", "web", "remove", *to_remove],
                    user="workspace",
                    environment=env,
                )
            for spec in targets_to_install:
                cmd = ["dsh", "plugin", "--profile", "web", "add"]
                if not spec.startswith(("http://", "https://", "/", "file:")):
                    cmd.append(f"--registry={npm_registry}")
                cmd.append(spec)
                ec_add, out_add = container.exec_run(cmd, user="workspace", environment=env)
                if ec_add != 0:
                    add_msg = out_add.decode("utf-8", errors="replace").strip() if out_add else ""
                    return {
                        "slug": sandbox.slug,
                        "ok": False,
                        "reinstalled": reinstalled,
                        "detail": f"failed to install {spec}: {add_msg[-240:]}",
                    }
                reinstalled.append(spec)

        ec2, out2 = container.exec_run(
            ["supervisorctl", "restart", "dsh"],
            user="root",
        )
        text = out2.decode("utf-8", errors="replace").strip() if out2 else ""
        return {
            "slug": sandbox.slug,
            "ok": ec2 == 0,
            "reinstalled": reinstalled,
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
