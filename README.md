# COLDCASE

## OSRM local

No conviene subir `osrm-data/` al repo: los binarios son pesados y dependen del mapa.

Para regenerarlo localmente:

```bash
./scripts/prepare-osrm.sh
```

La primera vez puede tardar porque primero intenta bajar el ZIP publicado en el release de GitHub y, si no existe o falla, descarga el mapa y genera los archivos OSRM localmente; después reutiliza lo ya creado en `osrm-data/`.
Eso deja OSRM listo en `http://localhost:5000`.

### Flujo recomendado

```bash
make dev
```

Comandos rápidos:

- `make help` — muestra los comandos disponibles.
- `make bootstrap` — intenta descargar el release y, si no existe, genera los datos.
- `make up` — levanta los servicios con `docker compose`.
- `make down` — detiene el stack.

CI: hay un workflow manual en `.github/workflows/build-osrm-artifact.yml` que genera `osrm-data.zip` y publica un release de GitHub. Si quieres evitar generar datos localmente, descarga ese ZIP y descomprímelo en `osrm-data/`.