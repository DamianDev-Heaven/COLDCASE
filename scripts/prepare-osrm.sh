#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/osrm-data"
PBF_URL="https://download.geofabrik.de/central-america/el-salvador-latest.osm.pbf"
PBF_FILE="$DATA_DIR/el-salvador-latest.osm.pbf"
OSRM_BASE_URL="http://localhost:5000"
OSRM_RELEASE_TAG="osrm-data-el-salvador"
OSRM_RELEASE_ZIP="osrm-data.zip"

repo_slug_from_remote() {
  local remote_url

  remote_url="$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null || true)"
  if [[ -z "$remote_url" ]]; then
    return 1
  fi

  remote_url="${remote_url%.git}"
  if [[ "$remote_url" =~ github\.com[:/](.+)/(.+)$ ]]; then
    printf '%s/%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    return 0
  fi

  return 1
}

release_zip_url() {
  local repo_slug

  if [[ -n "${OSRM_RELEASE_URL:-}" ]]; then
    printf '%s' "$OSRM_RELEASE_URL"
    return 0
  fi

  if repo_slug="$(repo_slug_from_remote)"; then
    printf 'https://github.com/%s/releases/download/%s/%s' "$repo_slug" "$OSRM_RELEASE_TAG" "$OSRM_RELEASE_ZIP"
    return 0
  fi

  return 1
}

extract_release_zip() {
  local zip_file="$1"

  if command -v unzip >/dev/null 2>&1; then
    unzip -oq "$zip_file" -d "$ROOT_DIR"
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 -m zipfile -e "$zip_file" "$ROOT_DIR"
    return 0
  fi

  echo "No hay unzip ni python3 para descomprimir el release de OSRM" >&2
  return 1
}

osrm_core_files=(
  "$DATA_DIR/el-salvador-latest.osrm"
  "$DATA_DIR/el-salvador-latest.osrm.properties"
  "$DATA_DIR/el-salvador-latest.osrm.icd"
  "$DATA_DIR/el-salvador-latest.osrm.fileIndex"
  "$DATA_DIR/el-salvador-latest.osrm.edges"
  "$DATA_DIR/el-salvador-latest.osrm.turn_weight_penalties"
  "$DATA_DIR/el-salvador-latest.osrm.turn_duration_penalties"
)

has_valid_osrm_data() {
  for file_path in "${osrm_core_files[@]}"; do
    [[ -f "$file_path" ]] || return 1
  done

  return 0
}

if ! command -v docker >/dev/null 2>&1; then
  echo "docker no esta disponible" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl no esta disponible" >&2
  exit 1
fi

mkdir -p "$DATA_DIR"

if has_valid_osrm_data; then
  echo "OSRM data ya existe y parece completo."
else
  release_url="$(release_zip_url 2>/dev/null || true)"
  if [[ -n "$release_url" ]]; then
    release_zip_path="$ROOT_DIR/.tmp-osrm-data.zip"
    echo "Intentando descargar OSRM publicado..."
    if curl -fsSL -o "$release_zip_path" "$release_url" && extract_release_zip "$release_zip_path" && has_valid_osrm_data; then
      rm -f "$release_zip_path"
      echo "OSRM descargado desde release."
    else
      rm -f "$release_zip_path"
      echo "No se pudo usar el release; se construira localmente."
    fi
  fi

  if ! has_valid_osrm_data; then
    if [[ ! -f "$PBF_FILE" ]]; then
      echo "Descargando mapa de El Salvador..."
      curl -L --fail -o "$PBF_FILE" "$PBF_URL"
    fi

    echo "Generando datos OSRM..."
    docker run --rm -v "$DATA_DIR:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/el-salvador-latest.osm.pbf
    docker run --rm -v "$DATA_DIR:/data" osrm/osrm-backend osrm-partition /data/el-salvador-latest.osrm
    docker run --rm -v "$DATA_DIR:/data" osrm/osrm-backend osrm-customize /data/el-salvador-latest.osrm
  fi
fi

echo "Levantando el servicio OSRM..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d osrm

echo "Validando respuesta de OSRM..."
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "$OSRM_BASE_URL/route/v1/driving/-89.2182,13.6929;-89.2045,13.7001?overview=false" | grep -q '"code":"Ok"'; then
    echo "Listo. OSRM responde en $OSRM_BASE_URL"
    exit 0
  fi

  sleep 2
done

echo "OSRM no respondió correctamente despues de levantar el servicio" >&2
exit 1