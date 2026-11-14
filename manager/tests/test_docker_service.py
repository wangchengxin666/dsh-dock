from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from docker.errors import ImageNotFound, NotFound

from app.config import Settings
from app.docker_service import DockerService, SandboxRuntimeError
from app.models import LlmProfile, Sandbox, User
from app.security import encrypt_secret


def _make_sandbox(slug: str = "alice", **kwargs) -> Sandbox:
    user = User(email=f"{slug}@example.com", display_name=slug.title())
    sbx = Sandbox(
        user=user,
        user_id="user-1",
        slug=slug,
        volume_name=f"dsh-{slug}-home",
        image_repo="dsh-sandbox",
        image_tag="latest",
        template="agent-os",
        cpu_limit=2.0,
        memory_limit="4g",
        status="creating",
    )
    for k, v in kwargs.items():
        setattr(sbx, k, v)
    return sbx


def test_environment_generation_and_plugin_resolution(tmp_path):
    ca_file = tmp_path / "corp-ca.crt"
    ca_file.write_text("-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----\n", encoding="utf-8")

    settings = Settings(
        _env_file=None,
        manager_public_url="https://sandbox.corp.example",
        manager_internal_url="http://dsh-manager:9000",
        sandbox_auto_install_plugins="file-manager",
        custom_ca_bundle_path=str(ca_file),
    )
    svc = DockerService(settings)

    profile = LlmProfile(
        name="DeepSeek",
        base_url="https://api.deepseek.com/v1",
        model="deepseek-chat",
        api_key_ciphertext=encrypt_secret("sk-secret-key"),
    )
    sbx = _make_sandbox(
        extra_env_json='{"CUSTOM_FOO": "bar"}',
        auto_install_plugins="extra-plugin, https://custom.example.com/p.tgz",
        init_repo_url="https://git.example.com/starter.git",
        init_script="#!/usr/bin/env bash\necho ready",
        llm_profile=profile,
    )

    env = svc.environment(sbx)
    assert env["SANDBOX_BASE_PATH"] == "/s/alice"
    assert env["SANDBOX_PUBLIC_ORIGIN"] == "https://sandbox.corp.example"
    assert env["SANDBOX_PUBLIC_URL"] == "https://sandbox.corp.example/s/alice/"
    assert env["DSH_MOUNT"] == "/s/alice/dsh"
    assert env["DSH_PUBLIC_URL"] == "https://sandbox.corp.example/s/alice/dsh/"
    assert env["DSH_TOKEN_COOKIE_NAME"] == "dsh_token_seen_alice"
    assert env["DSH_PLUGIN_INDEX_URL"] == "http://dsh-manager:9000/plugins/index.json"
    assert env["DSH_DEFAULT_LLM_PROVIDER"] == "openai-compatible"
    assert env["DSH_DEFAULT_LLM_BASE_URL"] == "https://api.deepseek.com/v1"
    assert env["DSH_DEFAULT_LLM_MODEL"] == "deepseek-chat"
    assert env["DSH_DEFAULT_LLM_API_KEY"] == "sk-secret-key"
    assert env["CUSTOM_FOO"] == "bar"
    assert env["SANDBOX_INIT_REPO_URL"] == "https://git.example.com/starter.git"
    assert env["SANDBOX_INIT_SCRIPT"] == "#!/usr/bin/env bash\necho ready"

    # Relative plugin slugs resolve against manager_internal_url packages endpoint
    assert (
        env["DSH_AUTO_INSTALL_PLUGINS"]
        == "http://dsh-manager:9000/plugins/packages/extra-plugin.tgz,https://custom.example.com/p.tgz"
    )

    blank_script_sbx = _make_sandbox(init_script="   \n  ")
    assert "SANDBOX_INIT_SCRIPT" not in svc.environment(blank_script_sbx)


def test_create_container_uses_no_host_ports_and_traefik_forwardauth(tmp_path):
    ca_file = tmp_path / "ca.crt"
    ca_file.write_text("cert", encoding="utf-8")

    settings = Settings(
        _env_file=None,
        manager_public_url="http://localhost:9000",
        manager_internal_url="http://dsh-manager:9000",
        dsh_network="dsh-manager",
        pull_missing_image=False,
        custom_ca_bundle_path=str(ca_file),
    )
    svc = DockerService(settings)

    mock_client = MagicMock()
    mock_client.networks.get.side_effect = NotFound("missing network")
    mock_container = MagicMock()
    mock_container.id = "container-id-alice"
    mock_client.containers.run.return_value = mock_container
    svc._client = mock_client

    sbx = _make_sandbox()
    container = svc.create(sbx)
    assert container.id == "container-id-alice"

    mock_client.networks.create.assert_called_once_with("dsh-manager", driver="bridge")
    _, kwargs = mock_client.containers.run.call_args
    assert "ports" not in kwargs
    assert kwargs["network"] == "dsh-manager"
    assert kwargs["security_opt"] == ["no-new-privileges:true"]
    assert kwargs["mem_limit"] == "4g"
    assert kwargs["cpu_period"] == 100_000
    assert kwargs["cpu_quota"] == 200_000

    # Persistent volume mounts at /home/workspace + optional CA read-only mount
    volumes = kwargs["volumes"]
    assert volumes["dsh-alice-home"] == {"bind": "/home/workspace", "mode": "rw"}
    assert volumes[str(ca_file.resolve())] == {"bind": "/etc/dsh/ca/custom-ca.crt", "mode": "ro"}

    labels = kwargs["labels"]
    assert labels["traefik.enable"] == "true"
    assert labels["traefik.http.routers.dsh-sbx-alice.rule"] == "PathPrefix(`/s/alice`)"
    assert labels["traefik.http.routers.dsh-sbx-alice.priority"] == "100"
    assert labels["traefik.http.routers.dsh-sbx-alice-dsh.priority"] == "120"
    assert labels["traefik.http.routers.dsh-sbx-alice-dsh.middlewares"] == "dsh-auth-alice@docker"
    assert (
        labels["traefik.http.middlewares.dsh-auth-alice.forwardauth.address"]
        == "http://dsh-manager:9000/api/auth/verify-sandbox/alice"
    )
    assert labels["traefik.http.services.dsh-sbx-alice.loadbalancer.server.port"] == "8080"


def test_ensure_image_missing_raises_or_pulls():
    svc = DockerService(Settings(_env_file=None, pull_missing_image=False))
    mock_client = MagicMock()
    mock_client.images.get.side_effect = ImageNotFound("no image")
    svc._client = mock_client

    with pytest.raises(SandboxRuntimeError, match="PULL_MISSING_IMAGE=true"):
        svc._ensure_image("latest", "dsh-sandbox")

    svc_pull = DockerService(Settings(_env_file=None, pull_missing_image=True))
    svc_pull._client = mock_client
    svc_pull._ensure_image("latest", "dsh-sandbox")
    mock_client.images.pull.assert_called_once_with("dsh-sandbox", tag="latest")


def test_wait_healthy_stats_logs_backup_and_sync(monkeypatch):
    status_code_holder = {"code": 200}

    class _FakeHttpClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url):
            return type("_Resp", (), {"status_code": status_code_holder["code"]})()

    monkeypatch.setattr("app.docker_service.httpx.Client", _FakeHttpClient)
    monkeypatch.setattr("app.docker_service.time.sleep", lambda _s: None)

    svc = DockerService(
        Settings(_env_file=None, health_timeout_seconds=10, manager_internal_url="http://dsh-manager:9000")
    )
    mock_client = MagicMock()
    svc._client = mock_client

    container = MagicMock()
    container.status = "running"
    container.attrs = {"State": {"Health": {"Status": "healthy"}}}
    container.logs.return_value = b"\x1b[32mok\x1b[0m\ndsh web: http://127.0.0.1:3080/?token=abc123\n"
    container.stats.return_value = {
        "cpu_stats": {"cpu_usage": {"total_usage": 200}, "system_cpu_usage": 1000, "online_cpus": 2},
        "precpu_stats": {"cpu_usage": {"total_usage": 100}, "system_cpu_usage": 500},
        "memory_stats": {"usage": 256 * 1024 * 1024, "limit": 1024 * 1024 * 1024, "stats": {"file": 0}},
    }
    container.get_archive.return_value = (iter([b"tarbytes"]), {"size": 8})
    container.exec_run.return_value = (0, b"synced\n")
    mock_client.containers.get.return_value = container

    sbx = _make_sandbox()
    svc.wait_healthy(sbx)

    assert "ok" in svc.logs(sbx)
    assert "\x1b[" not in svc.logs(sbx)
    assert svc.launch_token_url(sbx) == "http://127.0.0.1:3080/?token=abc123"

    stats = svc.stats(sbx)
    assert stats["cpu_percent"] == 40.0
    assert stats["memory_usage_mb"] == 256.0
    assert stats["memory_limit_mb"] == 1024.0

    stream = svc.export_workspace_tar(sbx)
    container.get_archive.assert_called_with("/home/workspace")
    assert b"".join(stream) == b"tarbytes"

    sync = svc.sync_plugin_market(sbx, reinstall_plugins=["http://dsh-manager:9000/plugins/packages/file-manager.tgz"])
    assert sync["ok"] is True
    assert sync["slug"] == "alice"

    # Unhealthy timeout raises SandboxRuntimeError
    status_code_holder["code"] = 503
    svc.settings.health_timeout_seconds = 0
    with pytest.raises(SandboxRuntimeError, match="did not become healthy"):
        svc.wait_healthy(sbx)
