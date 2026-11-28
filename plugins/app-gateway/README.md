# `@dsh-dock/app-gateway`

Clean Published Apps & Background Services manager inside DeepSeek Harness (`dsh`).

- **Published Web Apps (`/apps/*`)**: List exposed routes, publish local ports, open links, and toggle 1-click access control between `public` and `caddy` (`sandbox-expose --set-auth`).
- **Background Services (`supervisor`)**: Register, start, stop, restart, remove, and view live tail logs for `sandbox-service` processes.
- **Native Harness Tools**: `app_gateway_list`, `app_gateway_expose`, `app_gateway_service`.
