#!/usr/bin/env bash

set -euo pipefail

# Find root directory
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

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Dynamic watch mode check
WATCH_MODE=false
if [[ "${1:-}" == "--watch" || "${1:-}" == "-w" ]]; then
  WATCH_MODE=true
fi

print_header() {
  local title="$1"
  echo -e "\n${BOLD}${BLUE}=== $title ===${NC}"
}

show_status() {
  # Context info
  local context
  context=$($KUBECTL config current-context 2>/dev/null || echo "Desconocido")
  
  echo -e "${BOLD}Cluster Context:${NC} ${CYAN}$context${NC} | ${BOLD}Namespace:${NC} ${CYAN}$NAMESPACE${NC}"
  echo -e "--------------------------------------------------------------------------------"

  # 1. Deployments and StatefulSets
  print_header "ESTADO DE DEPLOYMENTS & STATEFULSETS"
  printf "${BOLD}%-20s %-10s %-12s %-12s %-12s${NC}\n" "NOMBRE" "TIPO" "REPLICAS" "DISPONIBLES" "ACTUALIZADOS"
  echo "--------------------------------------------------------------------------------"
  
  # Deployments
  while read -r name desired ready updated; do
    if [[ -n "$name" ]]; then
      local status_color=$GREEN
      if [[ "$ready" -ne "$desired" ]]; then
        status_color=$YELLOW
      fi
      if [[ "$ready" -eq 0 ]]; then
        status_color=$RED
      fi
      printf "${status_color}%-20s${NC} %-10s %-12s %-12s %-12s\n" "$name" "Deployment" "$desired" "$ready" "$updated"
    fi
  done < <($KUBECTL get deployments -n $NAMESPACE -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.replicas}{"\t"}{.status.readyReplicas}{"\t"}{.status.updatedReplicas}{"\n"}{end}' 2>/dev/null || true)

  # StatefulSets
  while read -r name desired ready; do
    if [[ -n "$name" ]]; then
      local status_color=$GREEN
      if [[ "$ready" -ne "$desired" ]]; then
        status_color=$YELLOW
      fi
      if [[ "$ready" -eq 0 ]]; then
        status_color=$RED
      fi
      printf "${status_color}%-20s${NC} %-10s %-12s %-12s %-12s\n" "$name" "StatefulSet" "$desired" "$ready" "$ready"
    fi
  done < <($KUBECTL get statefulsets -n $NAMESPACE -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.replicas}{"\t"}{.status.readyReplicas}{"\n"}{end}' 2>/dev/null || true)

  # 2. Pod Details
  print_header "DETALLES DE LOS PODS"
  printf "${BOLD}%-28s %-10s %-8s %-12s %-16s${NC}\n" "POD" "ESTADO" "RESTARTS" "IP" "IMAGEN/TAG"
  echo "--------------------------------------------------------------------------------"
  while read -r name status restarts pod_ip image; do
    if [[ -n "$name" ]]; then
      local status_color=$GREEN
      if [[ "$status" != "Running" && "$status" != "Completed" ]]; then
        status_color=$RED
      fi
      if [[ "$status" == "ContainerCreating" || "$status" == "Pending" || "$status" == "Terminating" ]]; then
        status_color=$YELLOW
      fi
      
      # Shorten image name for cleaner output
      local short_image="${image##*/}"
      
      printf "${status_color}%-28s${NC} %-10s %-8s %-12s %-16s\n" "$name" "$status" "$restarts" "$pod_ip" "$short_image"
    fi
  done < <($KUBECTL get pods -n $NAMESPACE -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.phase}{"\t"}{.status.containerStatuses[0].restartCount}{"\t"}{.status.podIP}{"\t"}{.spec.containers[0].image}{"\n"}{end}' 2>/dev/null || true)

  # 3. Services, Ingress & SSL Certificates
  print_header "RUTAS DE INGRESS & SSL"
  $KUBECTL get ingress -n $NAMESPACE -o jsonpath='{range .items[*]}{range .spec.rules[*]}{.host}{"\t"}{range ..paths[*]}{.path}{"\t"}{.backend.service.name}{"\t"}{.backend.service.port.number}{"\n"}{end}{end}{end}' | \
  while read -r host path svc port; do
    if [[ -n "$host" ]]; then
      echo -e "${BOLD}Ruta:${NC} https://$host$path  -->  ${CYAN}$svc:$port${NC}"
    fi
  done

  # Ingress IP Address
  local ingress_ip
  ingress_ip=$($KUBECTL get ingress -n $NAMESPACE -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
  if [[ -n "$ingress_ip" ]]; then
    echo -e "${BOLD}IP Pública Ingress:${NC} ${GREEN}$ingress_ip${NC}"
  else
    echo -e "${BOLD}IP Pública Ingress:${NC} ${YELLOW}Buscando/No asignada todavía${NC}"
  fi

  # Certificates
  while read -r cert_name ready secret age; do
    if [[ -n "$cert_name" ]]; then
      local cert_color=$GREEN
      if [[ "$ready" != "True" ]]; then
        cert_color=$RED
      fi
      echo -e "${BOLD}Certificado SSL ($cert_name):${NC} ${cert_color}Ready=$ready${NC} (Secret: $secret, Age: $age)"
    fi
  done < <($KUBECTL get certificates -n $NAMESPACE -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.conditions[?(@.type=="Ready")].status}{"\t"}{.spec.secretName}{"\t"}{.metadata.creationTimestamp}{"\n"}{end}' 2>/dev/null || true)

  # 4. Resource Usage (if available)
  if $KUBECTL top pods -n $NAMESPACE >/dev/null 2>&1; then
    print_header "CONSUMO DE RECURSOS (METRICS)"
    $KUBECTL top pods -n $NAMESPACE
  fi

  # 5. Recent warnings or failures
  print_header "EVENTOS RECIENTES (ÚLTIMOS 8 EVENTOS)"
  $KUBECTL get events -n $NAMESPACE --sort-by='.metadata.lastTimestamp' -o custom-columns=TIEMPO:.metadata.lastTimestamp,TIPO:.type,RAZON:.reason,MENSAJE:.message | tail -n 8 || true
}

if [ "$WATCH_MODE" = true ]; then
  if command -v watch >/dev/null 2>&1; then
    # We run the watch loop in terminal
    watch -n 3 -c "$0"
  else
    while true; do
      clear
      show_status
      echo -e "\n${YELLOW}Actualizando cada 3 segundos... Presiona [Ctrl+C] para salir.${NC}"
      sleep 3
    done
  fi
else
  show_status
fi
