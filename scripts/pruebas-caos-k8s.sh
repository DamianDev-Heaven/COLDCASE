#!/usr/bin/env bash
# ==============================================================================
# COLDCASE v2 — Script de Automatización de Pruebas de Resiliencia en Kubernetes
# ==============================================================================
# Este script automatiza la inyección de fallos (Chaos Engineering) en el clúster
# de Kubernetes (Akamai LKE) para certificar la durabilidad y resiliencia de datos.
#
# Requisitos:
#   - kubectl configurado y con acceso al clúster de Akamai.
#   - Permisos en el namespace 'coldcase'.
# ==============================================================================

set -euo pipefail

# Detectar y priorizar el binario de kubectl en la raíz del proyecto
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "${PROJECT_ROOT}/kubectl" ]; then
    export PATH="${PROJECT_ROOT}:${PATH}"
fi

# Configuración del Entorno
NAMESPACE="coldcase"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${CYAN}[INFO] $(date +'%H:%M:%S') - $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}[ALERT] $(date +'%H:%M:%S') - $1${NC}"
}

log_success() {
    echo -e "${GREEN}[SUCCESS] $(date +'%H:%M:%S') - $1${NC}"
}

log_error() {
    echo -e "${RED}[ERROR] $(date +'%H:%M:%S') - $1${NC}"
}

# Verificar conexión y namespace
check_connection() {
    log_info "Verificando conexión con el clúster de Kubernetes en Akamai..."
    if ! kubectl get ns "${NAMESPACE}" &>/dev/null; then
        log_error "No se pudo conectar al clúster o el namespace '${NAMESPACE}' no existe."
        log_info "Asegúrate de tener configurado tu Kubeconfig actual."
        exit 1
    fi
    log_success "Conectado exitosamente al namespace '${NAMESPACE}'."
}

# --- ESCENARIO 1: CAÍDA ABRUPTA DEL BACKEND ---
prueba_caida_backend() {
    echo -e "\n=== 🧪 PRUEBA 1: CAÍDA ABRUPTA DEL POD DE BACKEND ==="
    log_info "Obteniendo pods de backend activos..."
    local pods=$(kubectl get pods -n "${NAMESPACE}" -l app=backend -o jsonpath='{.items[*].metadata.name}')
    
    if [ -z "${pods}" ]; then
        log_error "No se encontraron pods con la etiqueta 'app=backend'."
        return 1
    fi

    log_warn "Matando el pod de backend de forma abrupta (SIGKILL)..."
    for pod in ${pods}; do
        log_info "Eliminando pod: ${pod}"
        kubectl delete pod "${pod}" -n "${NAMESPACE}" --force --grace-period=0
    done

    log_info "Esperando a que Kubernetes detecte el fallo y levante un nuevo pod..."
    sleep 3
    
    log_info "Monitoreando el estado de recuperación del Deployment del backend..."
    if kubectl rollout status deployment/backend -n "${NAMESPACE}" --timeout=60s; then
        log_success "Kubernetes auto-recuperó el pod del Backend con éxito y está listo de nuevo."
    else
        log_error "Fallo en la auto-recuperación rápida del Backend."
    fi
}

# --- ESCENARIO 2: APAGADO TOTAL DE LA BASE DE DATOS ---
prueba_apagado_db() {
    echo -e "\n=== 🧪 PRUEBA 2: APAGADO TOTAL Y RESTAURACIÓN DE LA DB ==="
    
    # Determinar si es StatefulSet o Deployment
    local db_kind="deployment"
    if kubectl get statefulset db -n "${NAMESPACE}" &>/dev/null; then
        db_kind="statefulset"
    fi
    
    log_warn "Apagando por completo la Base de Datos Postgres (escalando a 0 réplicas)..."
    kubectl scale "${db_kind}/db" -n "${NAMESPACE}" --replicas=0
    
    log_info "Esperando 8 segundos para simular inactividad de energía en la DB..."
    sleep 8
    
    log_info "Verificando que el Backend reporte fallos de conexión (degradación controlada)..."
    kubectl logs -l app=backend -n "${NAMESPACE}" --tail=15 || true
    
    log_info "Restaurando la Base de Datos (escalando de nuevo a 1 réplica)..."
    kubectl scale "${db_kind}/db" -n "${NAMESPACE}" --replicas=1
    
    log_info "Esperando a que Postgres inicialice y acepte conexiones..."
    sleep 10
    
    log_info "Comprobando la resiliencia de auto-reconexión del Backend..."
    if kubectl rollout status "${db_kind}/db" -n "${NAMESPACE}" --timeout=60s; then
        log_success "Base de datos en línea. Comprobando logs de reconexión del backend:"
        kubectl logs -l app=backend -n "${NAMESPACE}" --tail=10 || true
        log_success "¡DB y Backend comunicados de nuevo tras caída!"
    else
        log_error "La base de datos tardó demasiado en iniciar."
    fi
}

# --- ESCENARIO 3: AISLAMIENTO DE RED (BUFFER OFFLINE) ---
prueba_buffer_offline() {
    echo -e "\n=== 🧪 PRUEBA 3: SIMULACIÓN DE BUFFER OFFLINE EN EL SIMULADOR ==="
    log_info "Aislando el Simulador de la red del backend..."
    
    # Modificamos temporalmente la variable de entorno API_URL a una dirección inválida
    log_warn "Alterando la configuración del Simulador para romper la conexión..."
    kubectl set env deployment/simulador -n "${NAMESPACE}" API_URL="http://backend-roto:9999"
    
    log_info "Esperando que el Simulador aplique el cambio de configuración y entre en buffer offline..."
    sleep 10
    
    log_info "Verificando logs del simulador (debería registrar retención de telemetrías en buffer)..."
    kubectl logs -l app=simulador -n "${NAMESPACE}" --tail=15 || true
    
    log_info "Restaurando la conectividad del Simulador con el Backend real..."
    kubectl set env deployment/simulador -n "${NAMESPACE}" API_URL="http://backend:3000"
    
    log_info "Esperando restauración y vaciado del buffer offline..."
    sleep 10
    
    log_info "Verificando logs de transmisión exitosa del buffer..."
    kubectl logs -l app=simulador -n "${NAMESPACE}" --tail=20 || true
    log_success "¡Prueba de resiliencia del Buffer Offline completada con éxito!"
}

# Menú principal interactivo
mostrar_menu() {
    clear
    echo -e "${CYAN}======================================================================"
    echo -e "   COLDCASE v2 — TABLERO DE INYECCIÓN DE CAOS EN KUBERNETES (AKAMAI)"
    echo -e "======================================================================${NC}"
    echo -e "1) 🧪 Caída abrupta del Pod del Backend (Re-creación de Pods)"
    echo -e "2) 🔋 Apagado temporal y restauración de la Base de Datos (Re-conexión)"
    echo -e "3) 📡 Simular pérdida de conectividad en el Simulador (Buffer Offline)"
    echo -e "4) 🌀 Ejecutar los 3 escenarios en cadena (Prueba de Caos Completa)"
    echo -e "5) 🚪 Salir"
    echo -e "----------------------------------------------------------------------"
    read -p "Selecciona una opción [1-5]: " opcion

    case $opcion in
        1)
            prueba_caida_backend
            ;;
        2)
            prueba_apagado_db
            ;;
        3)
            prueba_buffer_offline
            ;;
        4)
            log_info "Iniciando prueba masiva de resiliencia de datos..."
            prueba_caida_backend || true
            prueba_apagado_db || true
            prueba_buffer_offline || true
            log_success "¡Prueba completa de Chaos e inyección de fallos finalizada!"
            ;;
        5)
            echo -e "${GREEN}Saliendo de la consola de Caos. ¡Mantén tu clúster seguro!${NC}"
            exit 0
            ;;
        *)
            log_error "Opción no válida."
            sleep 2
            ;;
    esac
    
    echo -e "\nPresiona [Enter] para volver al menú..."
    read -r
    mostrar_menu
}

# --- Flujo de Ejecución ---
check_connection

if [ $# -gt 0 ]; then
    case "$1" in
        --backend|1)
            prueba_caida_backend
            ;;
        --db|2)
            prueba_apagado_db
            ;;
        --buffer|3)
            prueba_buffer_offline
            ;;
        --all|4)
            log_info "Iniciando prueba masiva de resiliencia de datos..."
            prueba_caida_backend || true
            prueba_apagado_db || true
            prueba_buffer_offline || true
            log_success "¡Prueba completa de Chaos e inyección de fallos finalizada!"
            ;;
        *)
            echo "Uso: $0 [--backend | --db | --buffer | --all]"
            exit 1
            ;;
    esac
else
    mostrar_menu
fi
