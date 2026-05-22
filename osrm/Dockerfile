FROM osrm/osrm-backend

# Install curl for healthchecks using archived Debian repos if needed
USER root
RUN set -eux; \
    if command -v apt-get >/dev/null 2>&1; then \
      if grep -q 'deb.debian.org' /etc/apt/sources.list 2>/dev/null || grep -q 'security.debian.org' /etc/apt/sources.list 2>/dev/null; then \
        sed -i 's/deb.debian.org/archive.debian.org/g' /etc/apt/sources.list || true; \
        sed -i 's/security.debian.org/archive.debian.org/g' /etc/apt/sources.list || true; \
        echo 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99no-check-valid-until || true; \
      fi; \
      apt-get update || true; \
      apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*; \
    elif command -v apk >/dev/null 2>&1; then \
      apk add --no-cache curl ca-certificates; \
    else \
      echo "No supported package manager found; healthcheck may fail"; \
    fi
