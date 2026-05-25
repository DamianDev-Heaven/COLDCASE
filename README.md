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

## Guía de Actualización (Soporte Redis & BullMQ)

El sistema ahora integra una cola de mensajería asíncrona basada en **Redis** y **BullMQ** para procesar los diagnósticos pesados de Inteligencia Artificial (Zep + Groq) en segundo plano de manera no bloqueante. Esto evita cuellos de botella y errores 429 de límite de tasa en llamadas externas.

### Pasos para Actualizar desde una Versión Desactualizada

Si ya tenías el entorno clonado y te encuentras con errores de dependencias de BullMQ o la ausencia del contenedor de Redis al intentar ejecutar el proyecto, sigue esta secuencia de comandos para limpiar y reconstruir la pila local con los volúmenes actualizados:

1. **Obtener los últimos cambios del repositorio**:
   ```bash
   git pull origin main
   ```

2. **Apagar el stack anterior y eliminar volúmenes obsoletos**:
   Es indispensable borrar los volúmenes aislados creados previamente (en especial `backend_node_modules`) para forzar a Docker a instalar y registrar las nuevas dependencias (`@nestjs/bullmq`, `bullmq` e `ioredis`) declaradas en el `package.json`:
   ```bash
   docker compose down -v
   ```

3. **Reconstruir y levantar el stack actualizado**:
   Puedes volver a iniciar todos los servicios llamando al comando de preparación y arranque integrado:
   ```bash
   make dev
   ```
   Si ya cuentas con los datos de OSRM previamente descargados y no deseas volver a validarlos/descargarlos, puedes ejecutar simplemente:
   ```bash
   make up
   ```

Esto iniciará de manera transparente el nuevo contenedor Redis expuesto en el puerto `6379`, y reconstruirá la imagen del `backend` cargando y enlazando de forma segura la cola de tareas asíncronas.