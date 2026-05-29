#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Define kubectl binary path
KUBECTL="$ROOT_DIR/kubectl"
if [[ ! -f "$KUBECTL" ]]; then
  if command -v kubectl >/dev/null 2>&1; then
    KUBECTL="kubectl"
  else
    echo "Error: No se encontró 'kubectl' en el directorio raíz ni en el PATH del sistema." >&2
    exit 1
  fi
fi

NAMESPACE="coldcase"
DOCKER_USER="devdamian" # Default username from config

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Help message
show_help() {
  echo -e "${BOLD}Uso:${NC} $0 [comando] [opciones]"
  echo -e "\n${BOLD}Comandos disponibles:${NC}"
  echo -e "  ${CYAN}all${NC}        - Despliega todos los servicios (backend, frontend, simulador, osrm, db, redis)"
  echo -e "  ${CYAN}backend${NC}    - Compila y despliega el Backend"
  echo -e "  ${CYAN}frontend${NC}   - Compila y despliega el Frontend"
  echo -e "  ${CYAN}simulador${NC}  - Compila y despliega el Simulador"
  echo -e "  ${CYAN}osrm${NC}       - Compila y despliega OSRM"
  echo -e "  ${CYAN}db${NC}         - Despliega la Base de Datos (StatefulSet)"
  echo -e "  ${CYAN}redis${NC}      - Despliega Redis"
  echo -e "\n${BOLD}Opciones:${NC}"
  echo -e "  ${YELLOW}--skip-build${NC} - Salta la compilación y push de imágenes Docker"
  echo -e "  ${YELLOW}--skip-push${NC}  - Salta el comando de push de imágenes Docker"
  echo -e "  ${YELLOW}--skip-tests${NC} - Salta las validaciones y pruebas de código antes de compilar"
  exit 1
}

# Parse arguments
if [[ $# -eq 0 ]]; then
  show_help
fi

SERVICE="$1"
shift

SKIP_BUILD=false
SKIP_PUSH=false
SKIP_TESTS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --skip-push)
      SKIP_PUSH=true
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    *)
      echo "Opción desconocida: $1"
      show_help
      ;;
  esac
done

# Validate target service
VALID_SERVICES=("all" "backend" "frontend" "simulador" "osrm" "db" "redis")
if [[ ! " ${VALID_SERVICES[*]} " =~ " ${SERVICE} " ]]; then
  echo -e "${RED}Error: Servicio '${SERVICE}' no válido.${NC}"
  show_help
fi

# Run code validation tests
run_validation() {
  local dir="$1"
  local name="$2"
  
  if [ "$SKIP_TESTS" = true ]; then
    echo -e "${YELLOW}Omitiendo pruebas para $name...${NC}"
    return 0
  fi

  echo -e "\n${BOLD}${BLUE}>>> Validando $name...${NC}"
  if [[ ! -d "$ROOT_DIR/$dir" ]]; then
    echo -e "${RED}Error: Directorio $dir no existe.${NC}"
    return 1
  fi

  cd "$ROOT_DIR/$dir"
  
  if [[ -f "package.json" ]]; then
    echo -e "${CYAN}Instalando dependencias en $dir...${NC}"
    npm install
    
    echo -e "${CYAN}Ejecutando lint en $dir...${NC}"
    npm run lint || { echo -e "${RED}Error de Lint en $name.${NC}"; exit 1; }
    
    echo -e "${CYAN}Verificando tipos de TypeScript...${NC}"
    npx tsc --noEmit || { echo -e "${RED}Error de compilación TypeScript en $name.${NC}"; exit 1; }
    
    # Check if test script exists in package.json
    if grep -q '"test"' package.json; then
      echo -e "${CYAN}Ejecutando pruebas unitarias...${NC}"
      npm run test || { echo -e "${RED}Pruebas unitarias fallaron en $name.${NC}"; exit 1; }
    fi
  fi
  cd "$ROOT_DIR"
}

# Build and Push Docker image
build_and_push() {
  local service_name="$1"
  local dockerfile_dir="$2"
  local target_stage="${3:-}"
  local build_args="${4:-}"
  
  if [ "$SKIP_BUILD" = true ]; then
    echo -e "${YELLOW}Omitiendo compilación Docker para $service_name...${NC}"
    return 0
  fi

  local image_tag="$DOCKER_USER/coldcase-$service_name:latest"
  echo -e "\n${BOLD}${BLUE}>>> Construyendo imagen Docker para $service_name: ${CYAN}$image_tag${NC}"

  # Base build command
  local cmd="docker build -t $image_tag"
  
  if [[ -n "$target_stage" ]]; then
    cmd="$cmd --target $target_stage"
  fi
  
  if [[ -n "$build_args" ]]; then
    cmd="$cmd $build_args"
  fi
  
  cmd="$cmd $ROOT_DIR/$dockerfile_dir"
  
  echo -e "${CYAN}Ejecutando: $cmd${NC}"
  eval "$cmd"

  if [ "$SKIP_PUSH" = false ]; then
    echo -e "${BOLD}${BLUE}>>> Subiendo imagen a Docker Hub: ${CYAN}$image_tag${NC}"
    echo -e "${YELLOW}Nota: Asegúrate de haber iniciado sesión con 'docker login' si es necesario.${NC}"
    docker push "$image_tag"
  else
    echo -e "${YELLOW}Omitiendo el push a Docker Hub para $service_name...${NC}"
  fi
}

deploy_k8s() {
  local manifest="$1"
  echo -e "\n${BOLD}${BLUE}>>> Aplicando manifiestos de Kubernetes para $manifest...${NC}"
  $KUBECTL apply -f "$ROOT_DIR/infra/k8s/$manifest"
}

restart_and_wait() {
  local type="$1"
  local name="$2"
  
  echo -e "\n${BOLD}${BLUE}>>> Reiniciando $type/$name en namespace $NAMESPACE...${NC}"
  $KUBECTL rollout restart "$type/$name" -n "$NAMESPACE"
  
  echo -e "${CYAN}Esperando que se complete el despliegue...${NC}"
  if ! $KUBECTL rollout status "$type/$name" -n "$NAMESPACE" --timeout=120s; then
    echo -e "${RED}¡Error: El despliegue de $name falló en el tiempo límite!${NC}"
    echo -e "${YELLOW}=== Diagnósticos de Pods ===${NC}"
    $KUBECTL get pods -n "$NAMESPACE" -l "app=$name"
    $KUBECTL describe pods -n "$NAMESPACE" -l "app=$name" | head -n 30
    exit 1
  else
    echo -e "${GREEN}✓ $name se desplegó correctamente.${NC}"
  fi
}

# --- EJECUCIÓN DEL DESPLIEGUE ---

echo -e "${BOLD}${PURPLE}================================================================${NC}"
echo -e "${BOLD}${PURPLE}             INICIANDO DESPLIEGUE MANUAL DE COLDCASE            ${NC}"
echo -e "${BOLD}${PURPLE}================================================================${NC}"
echo -e "Servicio objetivo: ${BOLD}$SERVICE${NC}"
echo -e "Contexto K8s actual: ${BOLD}$($KUBECTL config current-context)${NC}\n"

# Verify namespace exists
$KUBECTL get namespace "$NAMESPACE" >/dev/null 2>&1 || {
  echo -e "${YELLOW}Creando namespace '$NAMESPACE'...${NC}"
  $KUBECTL create namespace "$NAMESPACE"
}

# 1. DB (Postgres)
if [[ "$SERVICE" == "db" || "$SERVICE" == "all" ]]; then
  echo -e "\n${BOLD}${YELLOW}[+] CONFIGURACIÓN DE BASE DE DATOS (POSTGRES)${NC}"
  # Ensure secrets exist
  $KUBECTL get secret coldcase-secrets -n "$NAMESPACE" >/dev/null 2>&1 || {
    echo -e "${YELLOW}Creando secretos de BD por defecto...${NC}"
    $KUBECTL create secret generic coldcase-secrets -n "$NAMESPACE" \
      --from-literal=DB_USER="admin" \
      --from-literal=DB_PASSWORD="adminpassword" \
      --from-literal=DATABASE_URL="postgresql://admin:adminpassword@db:5432/monitoreo_cadena_frio?schema=public" \
      --from-literal=JWT_SECRET="JAAESTOESTADEPRUEBAAQUI" \
      --from-literal=LLM_API_KEY="gsk_placeholder" \
      --from-literal=LLM_BOOST_API_KEY="gsk_placeholder" \
      --from-literal=ZEP_API_KEY="z_placeholder" || true
  }
  
  # Strategic removal of old deployment to ensure StatefulSet PV binding if switching
  if $KUBECTL get deployment db -n "$NAMESPACE" >/dev/null 2>&1; then
    echo -e "${YELLOW}Eliminando despliegue antiguo de base de datos para migrar a StatefulSet...${NC}"
    $KUBECTL delete deployment db -n "$NAMESPACE" --ignore-not-found=true
    $KUBECTL delete pod -l app=db -n "$NAMESPACE" --force --grace-period=0 || true
  fi

  deploy_k8s "postgres.yaml"
  
  # Wait for statefulset db
  echo -e "${CYAN}Esperando que la Base de Datos esté lista...${NC}"
  $KUBECTL rollout status statefulset/db -n "$NAMESPACE" --timeout=60s || true
fi

# 2. Redis
if [[ "$SERVICE" == "redis" || "$SERVICE" == "all" ]]; then
  echo -e "\n${BOLD}${YELLOW}[+] CONFIGURACIÓN DE REDIS${NC}"
  deploy_k8s "redis.yaml"
  restart_and_wait "deployment" "redis"
fi

# 3. OSRM (Mapeo y Enrutamiento)
if [[ "$SERVICE" == "osrm" || "$SERVICE" == "all" ]]; then
  echo -e "\n${BOLD}${YELLOW}[+] COMPILANDO Y DESPLEGANDO OSRM${NC}"
  build_and_push "osrm" "osrm"
  deploy_k8s "osrm.yaml"
  restart_and_wait "deployment" "osrm"
fi

# 4. Backend
if [[ "$SERVICE" == "backend" || "$SERVICE" == "all" ]]; then
  echo -e "\n${BOLD}${YELLOW}[+] COMPILANDO Y DESPLEGANDO BACKEND${NC}"
  run_validation "backend" "Backend"
  build_and_push "backend" "backend" "production"
  deploy_k8s "backend.yaml"
  restart_and_wait "deployment" "backend"
fi

# 5. Simulador
if [[ "$SERVICE" == "simulador" || "$SERVICE" == "all" ]]; then
  echo -e "\n${BOLD}${YELLOW}[+] COMPILANDO Y DESPLEGANDO SIMULADOR${NC}"
  build_and_push "simulador" "simulador" "production"
  deploy_k8s "simulador.yaml"
  restart_and_wait "deployment" "simulador"
fi

# 6. Frontend
if [[ "$SERVICE" == "frontend" || "$SERVICE" == "all" ]]; then
  echo -e "\n${BOLD}${YELLOW}[+] COMPILANDO Y DESPLEGANDO FRONTEND${NC}"
  run_validation "frontend" "Frontend"
  
  # Frontend needs API url build args
  BUILD_ARGS="--build-arg NEXT_PUBLIC_API_URL=https://api.ccase.tech --build-arg NEXT_PUBLIC_SIMULADOR_URL=https://api.ccase.tech/simulador"
  build_and_push "frontend" "frontend" "production" "$BUILD_ARGS"
  
  deploy_k8s "frontend.yaml"
  restart_and_wait "deployment" "frontend"
fi

# 7. Apply Ingress & Certs if deploying all
if [[ "$SERVICE" == "all" ]]; then
  echo -e "\n${BOLD}${YELLOW}[+] APLICANDO INGRESS, NETWORK POLICIES Y CONFIGURACIÓN SSL${NC}"
  deploy_k8s "namespace.yaml"
  deploy_k8s "network-policy.yaml"
  deploy_k8s "cluster-issuer.yaml"
  deploy_k8s "ingress.yaml"
  
  echo -e "\n${GREEN}✓ ¡Despliegue completo de todos los componentes finalizado con éxito!${NC}"
fi

echo -e "\n${BOLD}${BLUE}=== ESTADO FINAL DEL CLÚSTER ===${NC}"
"$ROOT_DIR/scripts/deploy-status.sh"
