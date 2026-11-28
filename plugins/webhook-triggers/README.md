# `@dsh-dock/webhook-triggers`

Inbound HTTP Webhook Receiver & Session Waker for DeepSeek Harness (`dsh`).

- **Endpoint Ingress**: Listens on `127.0.0.1:${WEBHOOK_PORT:-4095}`, routed through Caddy `/hooks/<slug>` bypassing browser login.
- **Cryptographic Verification**: Constant-time verification of `X-Hub-Signature-256` / `X-Webhook-Signature` (`sha256=<hex>`), `Authorization: Bearer <secret>`, or `X-Webhook-Secret`.
- **Payload Archival & Dedup**: Stores full JSON payloads under `~/.dsh-sandbox/webhooks/payloads/` and deduplicates by `X-GitHub-Delivery` / `X-Webhook-Delivery` / `Idempotency-Key`.
- **Async DSH Execution**: Returns `202 Accepted` immediately, wakes a fresh or pinned DSH session, records reply previews, supports 1-click Replay, and optionally POSTs completion callbacks.
