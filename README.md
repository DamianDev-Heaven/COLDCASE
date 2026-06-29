# Coldcase Logistics

**Coldcase** es un simulador y plataforma de monitoreo de flota logística enfocado en el rastreo de cadena de frío.

## Componentes

El proyecto está dividido en dos partes principales:
1. **Backend (API)**: Creado con NestJS, se encarga de recibir la telemetría, almacenar los viajes en la base de datos PostgreSQL, detectar anomalías usando un motor de reglas, y servir el dashboard web.
2. **Simulador (Frontend/Worker)**: Creado en Node.js, simula el movimiento de los camiones por diferentes rutas en El Salvador, generando y enviando telemetría falsa (temperatura, batería, posición GPS) para probar el sistema en tiempo real.

## Cómo ejecutar el proyecto

Asegúrate de tener Docker y Docker Compose instalados en tu computadora.

1. Abre una terminal en la raíz del proyecto.
2. Ejecuta el siguiente comando para levantar todos los servicios:
   ```bash
   docker compose up -d
   ```
3. Espera un par de minutos a que los contenedores arranquen.
4. Abre tu navegador web y entra a:
   [http://localhost:3000](http://localhost:3000)

## Dashboard de Monitoreo

Dentro de `http://localhost:3000` encontrarás el **Simulador y Dashboard**. Desde aquí puedes:
- Crear nuevos viajes simulados.
- Ver la posición de la flota en tiempo real sobre el mapa.
- Inyectar fallas de forma manual (como pérdida de señal celular, desviación de ruta, picos de temperatura o fallas en el compresor).
- Monitorear la respuesta de la Inteligencia Artificial al diagnosticar incidentes de la cadena de frío.

## Tecnologías Utilizadas
- **NestJS** (Backend)
- **Node.js** (Simulador)
- **PostgreSQL** + **Prisma** (Base de Datos)
- **Redis** (Cola de mensajes y caché)
- **Docker Compose** (Orquestación)

