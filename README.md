# 🧊 COLDCASE Logistics Platform

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-24.18.0-success)
![NestJS](https://img.shields.io/badge/NestJS-10.0-red)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)

**Coldcase** es una plataforma avanzada de simulación y monitoreo logístico diseñada para rastrear la cadena de frío en tiempo real. Provee un entorno completo para evaluar rutas, telemetría ambiental (temperatura y humedad) y diagnosticar anomalías operativas mediante inteligencia artificial.

---

## 📑 Tabla de Contenidos
- [Arquitectura del Sistema](#-arquitectura-del-sistema)
- [Características Principales](#-características-principales)
- [Tecnologías Utilizadas](#-tecnologías-utilizadas)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación y Despliegue](#-instalación-y-despliegue)
- [Uso del Dashboard](#-uso-del-dashboard)

---

## 🏗 Arquitectura del Sistema

El proyecto está diseñado bajo una arquitectura de microservicios contenerizada:

1. **Backend (Core API)**: Construido con NestJS. Administra la lógica de negocio, reglas de validación estricta de telemetría, persistencia de datos y orquestación de la inteligencia artificial.
2. **Simulador (Worker)**: Un motor en Node.js puro capaz de emular cientos de coordenadas GPS deterministas, consumo de batería y fluctuaciones climáticas utilizando algoritmos físicos.
3. **Frontend (Dashboard)**: Interfaz de usuario interactiva para visualización geoespacial, inyección de fallas en tiempo real y auditorías operativas.

---

## ✨ Características Principales

- 🗺️ **Rastreo Geoespacial Preciso**: Integración con OSRM (Open Source Routing Machine) para la generación de rutas reales.
- 🌡️ **Telemetría Física y Determinista**: Modelos algorítmicos que calculan desviaciones térmicas basadas en las condiciones de hardware y la latencia en las puertas de refrigeración.
- 🤖 **Diagnóstico Basado en IA**: El motor de inteligencia artificial inspecciona incidentes en tiempo real y categoriza los niveles de severidad ante la pérdida de la cadena de frío.
- ⚡ **Resiliencia Operativa**: Búfer offline y mecanismos de reintento automático para manejar pérdidas simuladas de cobertura celular (IoT).

---

## 💻 Tecnologías Utilizadas

- **Aplicación Core**: NestJS, TypeScript, Node.js.
- **Base de Datos y Caché**: PostgreSQL, Prisma ORM, Redis.
- **Enrutamiento**: OSRM (Motor de ruteo de código abierto).
- **Contenedores**: Docker y Docker Compose para garantizar la paridad entre desarrollo y producción.

---

## ⚙️ Requisitos Previos

Asegúrate de contar con las siguientes dependencias instaladas en tu entorno:

- [Docker](https://www.docker.com/) (Engine v20.10.0+)
- [Docker Compose](https://docs.docker.com/compose/) (v2.0.0+)

---

## 🚀 Instalación y Despliegue

La plataforma está completamente paquetizada para un despliegue sin fricciones. 

1. **Clona el repositorio** o ubícate en el directorio raíz del proyecto:
   ```bash
   cd COLDCASE
   ```

2. **Despliega los contenedores** en segundo plano (esto descargará las dependencias y construirá los microservicios):
   ```bash
   docker compose up -d --build
   ```

3. **Verifica la salud del clúster**:
   ```bash
   docker compose ps
   ```
   *Deberías observar todos los servicios en estado "Up" o "Running" (backend, db, redis, osrm, simulador, frontend).*

4. **Accede a la plataforma**:
   Abre tu navegador de preferencia y navega hacia:
   👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📊 Uso del Dashboard

Una vez dentro de la interfaz gráfica, el operador tiene el control total sobre la flota:

- **Monitoreo de Flota**: Observa todas las unidades en tiempo real con actualizaciones precisas.
- **Auditoría de Rutas**: Selecciona cualquier viaje activo para revisar su temperatura, humedad, y niveles de batería históricos.
- **Inyección de Anomalías**: Utiliza la consola de "Fallas / Inyección" para introducir condiciones adversas (falla del compresor, pérdida de IoT, apertura de compuertas) y evaluar cómo reacciona el sistema y los diagnósticos de IA.

---
*Desarrollado y optimizado para operaciones logísticas críticas.*
