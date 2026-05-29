# Coldcase - Monitoreo de Cadena de Frío e Inteligencia de Rutas

Sistema para la supervisión y auditoría en tiempo real de transporte logístico refrigerado (lácteos, carnes, congelados, medicamentos). El sistema integra geolocalización, control de temperatura, alertas automáticas, simulación de hardware y análisis de incidentes mediante procesamiento asíncrono e inteligencia artificial.

---

## 1. Topología y Arquitectura del Sistema

El proyecto está diseñado bajo una arquitectura de microservicios contenerizada con Docker Compose para desarrollo y Kubernetes para producción.

```
                  ┌─────────────────┐
                  │  Next.js (Web)  │
                  └────────┬────────┘
                           │ puerto 3001 (host)
                           ▼
                  ┌─────────────────┐
                  │  NestJS (API)   │◄───────┐ puerto 4000
                  └─┬──────┬──────┬─┘        │
                    │      │      │          │
   puerto 5432      ▼      │      ▼          │
┌────────────────┐ ┌───────┴──────┐ ┌────────┴────────┐
│ PostgreSQL DB  │ │ Redis / Queue│ │ Simulador IoT   │
└────────────────┘ └──────────────┘ └─────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   OSRM Engine   │ puerto 5000
                  └─────────────────┘
```

### Componentes y Puertos

| Servicio | Tecnología | Puerto Local | Descripción |
| :--- | :--- | :--- | :--- |
| **Frontend** | Next.js (React / Leaflet) | `3001` | Dashboard interactivo, mapas de rutas en tiempo real y visor de grafos de incidentes. |
| **Backend** | NestJS (TypeScript / PG) | `3000` | API central, autenticación JWT, registro de telemetría y gestor de incidentes. |
| **Simulador** | Node.js (Física / HTTP) | `4000` | Simulador físico de rutas de transporte con alteración de variables (puertas, motor, señal). |
| **OSRM** | Open Source Routing Machine | `5000` | Motor de enrutamiento basado en OpenStreetMap para calcular desvíos de ruta. |
| **Redis** | Redis (Broker) | `6379` | Gestor de colas de tareas con BullMQ para el procesamiento diferido de llamadas de IA. |
| **Database** | PostgreSQL | `5432` | Base de datos relacional para persistencia de telemetría y logs. |
| **Munin** | Munin Monitoring | `8080` | Servidor de monitorización y gráficas de recursos internos. |

---

## 2. Configuración del Entorno de Desarrollo

### Requisitos Previos
* Docker y Docker Compose
* Node.js (v18+)
* Cuenta y credenciales de Zep Cloud y Groq Cloud (para auditoría e IA)

### Configuración de Variables de Entorno

1. Copia el archivo `.env.example` en la raíz del proyecto a `.env`:
   ```bash
   cp .env.example .env
   ```
2. Define los siguientes parámetros obligatorios en el `.env`:
   * **Base de datos**: `DB_USER`, `DB_PASSWORD`, `DB_NAME` (configura credenciales para Postgres).
   * **JWT**: `JWT_SECRET` (clave de cifrado para tokens de sesión).
   * **Servicios de IA**:
     * `LLM_API_KEY`: API Key de Groq.
     * `ZEP_API_URL`: URL del endpoint de Zep Cloud (e.g. `https://api.getzep.com/api/v2`).
     * `ZEP_API_KEY`: API Key de Zep.

---

## 3. Puesta en Marcha en Local

El flujo de inicio se automatiza a través de un `Makefile` que descarga los mapas requeridos y compila las imágenes necesarias.

### Comandos de Ejecución

* **Inicializar y arrancar todo el stack (Recomendado)**:
  ```bash
  make dev
  ```
  *Este comando descarga la cartografía de El Salvador, preprocesa los archivos de OSRM (guardándolos en `osrm-data/`), compila las imágenes de Docker y arranca los contenedores.*

* **Descargar y preparar mapas manualmente**:
  ```bash
  make bootstrap
  ```

* **Levantar los servicios sin reconstruir mapas**:
  ```bash
  make up
  ```

* **Detener los servicios**:
  ```bash
  make down
  ```

* **Verificar el estado del motor OSRM**:
  ```bash
  make osrm-check
  ```

---

## 4. Despliegue en Kubernetes (Producción)

Los archivos de configuración de infraestructura para Kubernetes se encuentran organizados en la carpeta `infra/k8s/`.

### Estructura de Manifiestos (`infra/k8s/`)

* `namespace.yaml`: Aislamiento del entorno bajo el espacio de nombres `coldcase`.
* `postgres.yaml`: Configuración de base de datos Postgres persistente mediante `StatefulSet` y `PersistentVolumeClaim`.
* `redis.yaml`: Broker de colas para BullMQ en producción.
* `osrm.yaml`: Motor de enrutamiento optimizado para cálculo geográfico.
* `backend.yaml` y `frontend.yaml`: Despliegue de la API y el portal web.
* `simulador.yaml`: Simulador de telemetría corriendo de forma constante en el clúster.
* `network-policy.yaml`: Políticas de red de seguridad que aíslan el tráfico interno.
* `ingress.yaml` y `cluster-issuer.yaml`: Enrutamiento HTTP/HTTPS externo y renovación de certificados SSL a través de Cert-Manager.

### Scripts de Administración de Despliegue

La raíz cuenta con herramientas para el control y actualización interactiva en el clúster usando la versión empaquetada de `kubectl`:

* **Estado del clúster**:
  ```bash
  make deploy-status
  ```
  Muestra una vista limpia del estado de los Pods, Deployments, StatefulSets, rutas Ingress activas y certificados SSL.

* **Monitoreo en tiempo real**:
  ```bash
  make deploy-status-w
  ```
  Actualiza de forma constante la consola con el estado de los recursos de Kubernetes.

* **Actualización y Despliegue Manual**:
  ```bash
  ./scripts/deploy-manual.sh <servicio>
  ```
  Permite validar, compilar, subir a Docker Hub (`docker push`) y aplicar los cambios del microservicio seleccionado (ej. `backend`, `frontend`, `simulador`, `all`) al clúster de forma interactiva.

---

## 5. Pruebas y Aseguramiento de Calidad

Cada microservicio cuenta con pruebas automáticas integradas en el pipeline de CI/CD:

```bash
# Ejecutar lint y pruebas en el Backend
cd backend && npm run lint && npm run test

# Ejecutar lint y pruebas de tipos en el Frontend
cd frontend && npm run lint && npx tsc --noEmit
```