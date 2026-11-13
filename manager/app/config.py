from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:////data/dsh-manager.db"

    public_host: str = "localhost"
    public_scheme: str = "http"

    port_min: int = 18000
    port_max: int = 18999

    # Routing mode for sandboxes:
    # - 'subpath': Single-domain routing via Traefik (or Manager fallback) at /s/<slug>/...
    # - 'port': Direct host port per sandbox (:<port>/)
    sandbox_routing_mode: Literal["subpath", "port"] = "subpath"
    # Public URL of the outer Traefik gateway (defaults to manager_base_url if unset)
    gateway_public_url: str = ""
    # Bind address for sandbox published ports ('127.0.0.1' keeps ports local-only behind gateway)
    sandbox_port_bind_address: str = "127.0.0.1"

    dsh_image_repo: str = "dsh-sandbox"
    dsh_image_tag: str = "latest"
    dsh_network: str = "dsh-manager"
    pull_missing_image: bool = False
    dsh_permission_mode: str = "danger-full-access"
    sandbox_memory: str = "4g"
    sandbox_cpus: float = 2.0
    sandbox_timezone: str = "UTC"
    custom_ca_bundle_path: str = ""
    health_timeout_seconds: int = 75
    # True when running the manager directly on the Docker host.
    health_use_published_port: bool = False
    background_tasks: bool = True
    reconcile_interval_seconds: int = 60

    # Authentication modes:
    # - manager_auth_mode: 'oidc' (IdP SSO), 'token' (built-in admin token login), or 'none' (local dev)
    # - sandbox_auth_mode: 'oidc' (oauth2-proxy + email allowlist) or 'none' (DSH launch token only)
    manager_auth_mode: Literal["oidc", "token", "none"] = "oidc"
    sandbox_auth_mode: Literal["oidc", "none"] = "oidc"
    allow_self_service_create: bool = False

    oidc_issuer_url: str = ""
    # Optional internal OIDC discovery URL when manager runs inside Docker and
    # OIDC_ISSUER_URL is only resolvable from the host browser.
    oidc_discovery_url: str = ""
    oauth2_proxy_client_id: str = ""
    oauth2_proxy_client_secret: str = ""
    oauth2_proxy_cookie_secret: str = ""
    oauth2_proxy_scope: str = "openid profile email"
    oauth2_proxy_email_claim: str = "email"
    oauth2_proxy_cookie_secure: bool = False

    manager_admin_email: str = "admin@example.com"
    manager_admin_token: str = ""
    manager_public_url: str = ""
    # Internal URL reachable by sandbox containers (defaults to manager_base_url).
    manager_internal_url: str = ""
    secret_key: str = "change-me-in-production"

    # Self-hosted plugin index & registry settings
    plugins_dir: str = ""
    plugin_source_type: Literal["npm", "git"] = "npm"
    plugin_npm_registry: str = ""
    plugin_git_url: str = ""
    plugin_git_commit: str = ""
    plugin_index_title_en: str = ""
    plugin_index_title_zh: str = ""
    plugin_index_author: str = ""
    # Comma-separated plugin slugs or URLs to auto-install into new sandboxes (e.g. "file-manager")
    sandbox_auto_install_plugins: str = ""

    @property
    def public_origin(self) -> str:
        return f"{self.public_scheme}://{self.public_host}"

    @property
    def manager_base_url(self) -> str:
        if self.manager_public_url:
            return self.manager_public_url.rstrip("/")
        return f"{self.public_origin}:9000"

    @property
    def gateway_base_url(self) -> str:
        if self.gateway_public_url:
            return self.gateway_public_url.rstrip("/")
        return self.manager_base_url

    @property
    def gateway_host_header(self) -> str:
        parsed = urlsplit(self.gateway_base_url)
        return parsed.netloc or self.public_host

    def sandbox_url(self, port: int, slug: str | None = None) -> str:
        if self.sandbox_routing_mode == "subpath" and slug:
            return f"{self.gateway_base_url}/s/{slug}/"
        return f"{self.public_origin}:{port}/"

    @property
    def sandbox_reachable_manager_url(self) -> str:
        if self.manager_internal_url:
            return self.manager_internal_url.rstrip("/")
        return self.manager_base_url

    @property
    def plugin_index_url(self) -> str:
        return f"{self.gateway_base_url}/plugins/index.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
