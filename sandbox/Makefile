SHELL := /bin/bash
COMPOSE ?= docker compose
NAME ?= $(CONTAINER_NAME)
PORT ?=

.PHONY: help env build up down logs token shell expose

help:
	@cat <<'EOF'
	dsh-sandbox targets:
	  make env       create .env from the example
	  make build     build the image
	  make up        build + start, wait for health, print the token URL
	  make down      stop and remove the container
	  make logs      follow container logs
	  make token     print the current launch-token URL
	  make shell     open bash as the dev user
	  make expose NAME=web PORT=5173
	                 expose a loopback service at /apps/<name>/
	EOF

env:
	@test -f .env || (cp .env.example .env && echo "created .env - edit it before 'make up'")
	@chmod 600 .env

build:
	$(COMPOSE) build

up: env
	$(COMPOSE) up -d --build
	@echo "waiting for the health endpoint..."
	@for i in $$(seq 1 30); do \
	  port=$$($(COMPOSE) port sandbox 8080 2>/dev/null | sed 's/.*://'); \
	  [ -n "$$port" ] && curl -fsS "http://127.0.0.1:$$port/healthz" >/dev/null 2>&1 && break; \
	  sleep 2; \
	done
	@for i in $$(seq 1 30); do \
	  url=$$($(COMPOSE) logs --no-color 2>&1 | grep -oE 'https?://[^[:space:]]+token=[A-Za-z0-9_-]+' | tail -1); \
	  if [ -n "$$url" ]; then echo "open: $$url"; exit 0; fi; \
	  sleep 2; \
	done; \
	echo "DSH has not printed a launch URL yet; run 'make logs' or 'make token'."

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=200

# Print the current launch-token URL. The signed cookie lasts 30 days, so this
# is normally only needed for a new browser or after the cookie was cleared.
token:
	@$(COMPOSE) logs --no-color 2>&1 | grep -oE 'https?://[^[:space:]]+token=[A-Za-z0-9_-]+' | tail -1

shell:
	$(COMPOSE) exec -u dev -e HOME=/home/dev sandbox bash -l

# make expose NAME=web PORT=5173
expose:
	@test -n "$(NAME)" -a -n "$(PORT)" || (echo "usage: make expose NAME=web PORT=5173" >&2; exit 1)
	$(COMPOSE) exec -u dev sandbox sandbox-expose "$(NAME)" "$(PORT)"