from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.schemas import (
    LlmProfileCreate,
    SandboxCreate,
    SandboxPatch,
    TemplateCreate,
    _normalize_memory,
)
from app.security import (
    _fernet,
    decrypt_secret,
    encrypt_secret,
    hash_password,
    verify_password,
)


def test_settings_derived_urls():
    s_local = Settings(
        _env_file=None,
        manager_public_url="http://localhost:9000/",
        manager_internal_url="",
        dsh_network="dsh-manager",
    )
    assert s_local.manager_base_url == "http://localhost:9000"
    assert s_local.public_host_header == "localhost:9000"
    assert s_local.sandbox_url("alice") == "http://localhost:9000/s/alice/"
    assert s_local.sandbox_reachable_manager_url == "http://localhost:9000"
    assert s_local.plugin_index_url == "http://localhost:9000/plugins/index.json"

    s_internal = Settings(
        _env_file=None,
        manager_public_url="https://sandbox.example.com",
        manager_internal_url="http://dsh-manager:9000/",
    )
    assert s_internal.sandbox_reachable_manager_url == "http://dsh-manager:9000"

    s_remote = Settings(
        _env_file=None,
        manager_public_url="https://sandbox.example.com",
        manager_internal_url="",
    )
    assert s_remote.sandbox_reachable_manager_url == "https://sandbox.example.com"


def test_encrypt_decrypt_roundtrip_and_invalid_token(monkeypatch):
    monkeypatch.setattr(
        "app.security.get_settings",
        lambda: Settings(_env_file=None, secret_key="unit-test-secret-alpha-1234567890"),
    )
    _fernet.cache_clear()
    try:
        empty_cipher = encrypt_secret("")
        assert decrypt_secret(empty_cipher) == ""

        cipher = encrypt_secret("sk-super-secret-value")
        assert cipher != "sk-super-secret-value"
        assert decrypt_secret(cipher) == "sk-super-secret-value"

        with pytest.raises(ValueError, match="cannot decrypt secret"):
            decrypt_secret("not-a-valid-fernet-token")

        # Rotating secret key invalidates decryption of old ciphertext.
        monkeypatch.setattr(
            "app.security.get_settings",
            lambda: Settings(_env_file=None, secret_key="different-secret-key-beta-123456"),
        )
        _fernet.cache_clear()
        with pytest.raises(ValueError, match="cannot decrypt secret"):
            decrypt_secret(cipher)
    finally:
        _fernet.cache_clear()


def test_password_hashing_and_verification():
    encoded = hash_password("CorrectHorseBatteryStaple!")
    assert encoded.startswith("scrypt$")
    assert verify_password("CorrectHorseBatteryStaple!", encoded) is True
    assert verify_password("WrongPassword", encoded) is False
    assert verify_password("any", None) is False
    assert verify_password("any", "not-a-valid-hash") is False
    assert verify_password("any", "bcrypt$foo$bar") is False


def test_schema_memory_and_password_validators():
    assert _normalize_memory(None) is None
    assert _normalize_memory(" 4G ") == "4g"
    assert _normalize_memory("512m") == "512m"
    assert _normalize_memory("2048m") == "2048m"

    with pytest.raises(ValueError):
        _normalize_memory("512")
    with pytest.raises(ValueError):
        _normalize_memory("abc")

    sbx = SandboxCreate(
        email="User@Example.COM",
        display_name=" Alice ",
        initial_password="  strongpass123 ",
        memory_limit="2G",
    )
    assert sbx.email == "User@example.com"
    assert sbx.initial_password == "strongpass123"
    assert sbx.memory_limit == "2g"

    with pytest.raises(ValidationError):
        SandboxCreate(email="user@example.com", initial_password="short")

    with pytest.raises(ValidationError):
        TemplateCreate(key="BAD KEY!", name="Invalid")

    patch = SandboxPatch(cpu_limit=4.0, memory_limit="8G")
    assert patch.memory_limit == "8g"

    llm = LlmProfileCreate(
        name="OpenAI",
        base_url="https://api.openai.com/v1",
        model="gpt-4o",
        api_key="sk-123",
    )
    assert llm.name == "OpenAI"
