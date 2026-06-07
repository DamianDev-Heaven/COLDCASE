FROM osrm/osrm-backend

# Install curl for healthchecks and data downloading
USER root
RUN set -eux; \
    if command -v apt-get >/dev/null 2>&1; then \
      if grep -q 'deb.debian.org' /etc/apt/sources.list 2>/dev/null || grep -q 'security.debian.org' /etc/apt/sources.list 2>/dev/null; then \
        sed -i 's/deb.debian.org/archive.debian.org/g' /etc/apt/sources.list || true; \
        sed -i 's/security.debian.org/archive.debian.org/g' /etc/apt/sources.list || true; \
        echo 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99no-check-valid-until || true; \
      fi; \
      apt-get update || true; \
      apt-get install -y --no-install-recommends curl ca-certificates unzip && rm -rf /var/lib/apt/lists/*; \
    elif command -v apk >/dev/null 2>&1; then \
      apk add --no-cache curl ca-certificates unzip; \
    else \
      echo "No supported package manager found; healthcheck may fail"; \
    fi

# Create data directory and pre-build El Salvador OSRM files
WORKDIR /data
RUN curl -L --fail -o el-salvador-latest.osm.pbf https://download.geofabrik.de/central-america/el-salvador-latest.osm.pbf && \
    osrm-extract -p /opt/car.lua el-salvador-latest.osm.pbf && \
    osrm-partition el-salvador-latest.osrm && \
    osrm-customize el-salvador-latest.osrm && \
    rm el-salvador-latest.osm.pbf

WORKDIR /opt

