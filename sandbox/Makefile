SHELL := /bin/bash
COMPOSE ?= docker compose -f ../docker-compose.yml --project-directory ..

.PHONY: help env build up down logs shell expose

help:
	@cat <<'EOF'
	dsh-sandbox targets (delegating to root docker-compose.yml):
	  make env       create ../.env from ../.env.example
	  make build     build the dsh-sandbox image
	  make up        build + start the workbench
	  make down      stop and remove the container
	  make logs      follow container logs
	  make shell     open bash as the workspace user
	  make expose NAME=web PORT=5173
	                 expose a loopback service at /apps/<name>/
	EOF

env:
	@test -f ../.env || (cp ../.env.example ../.env && echo "created ../.env - edit it before 'make up'")
	@chmod 600 ../.env

build:
	$(COMPOSE) build

up: env
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=200

shell:
	$(COMPOSE) exec -u workspace -e HOME=/home/workspace sandbox bash -l

expose:
	@test -n "$(NAME)" -a -n "$(PORT)" || (echo "usage: make expose NAME=web PORT=5173" >&2; exit 1)
	$(COMPOSE) exec -u workspace -e HOME=/home/workspace sandbox sandbox-expose "$(NAME)" "$(PORT)"
