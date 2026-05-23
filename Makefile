.PHONY: bootstrap up down osrm-check dev

help:
	@echo "Comandos disponibles:"
	@echo "  make bootstrap   - descarga/genera OSRM si falta"
	@echo "  make up          - levanta db/backend/frontend/simulador/osrm"
	@echo "  make osrm-check  - valida que OSRM responda"
	@echo "  make dev         - bootstrap + up + osrm-check"

bootstrap:
	./scripts/prepare-osrm.sh

up:
	docker compose up -d --build db backend frontend simulador osrm munin

down:
	docker compose down

osrm-check:
	curl -fsS 'http://localhost:5000/route/v1/driving/-89.2182,13.6929;-89.2045,13.7001?overview=false' | grep -q '"code":"Ok"'

dev: bootstrap up osrm-check
