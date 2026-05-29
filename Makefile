.PHONY: bootstrap up down osrm-check dev deploy-status deploy-status-watch deploy-manual

help:
	@echo "Comandos disponibles:"
	@echo "  make bootstrap         - descarga/genera OSRM si falta"
	@echo "  make up                - levanta db/backend/frontend/simulador/osrm"
	@echo "  make osrm-check        - valida que OSRM responda"
	@echo "  make dev               - bootstrap + up + osrm-check"
	@echo "  make deploy-status     - muestra el estado del despliegue en Kubernetes (LKE)"
	@echo "  make deploy-status-w   - monitorea en tiempo real el estado en Kubernetes"
	@echo "  make deploy-manual     - ejecuta el despliegue manual interactivamente"

bootstrap:
	./scripts/prepare-osrm.sh

up:
	docker compose up -d --build

down:
	docker compose down

osrm-check:
	curl -fsS 'http://localhost:5000/route/v1/driving/-89.2182,13.6929;-89.2045,13.7001?overview=false' | grep -q '"code":"Ok"'

dev: bootstrap up osrm-check

deploy-status:
	./scripts/deploy-status.sh

deploy-status-w:
	./scripts/deploy-status.sh --watch

deploy-manual:
	@echo "Para desplegar un servicio específico usa: ./scripts/deploy-manual.sh <servicio>"
	@echo "Servicios: all, backend, frontend, simulador, osrm, db, redis"
	@echo "Ejemplo: ./scripts/deploy-manual.sh backend"
	@echo ""
	./scripts/deploy-manual.sh all

