-- ============================================
-- EXTENSIÓN PARA UUID
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE rol_usuario_enum AS ENUM ('Admin', 'Operador', 'Auditor');

CREATE TYPE estado_transporte_enum AS ENUM ('Activo', 'Mantenimiento');

CREATE TYPE estado_viaje_enum AS ENUM (
    'pendiente',
    'en_curso',
    'pausado',
    'cancelado',
    'finalizado'
);

CREATE TYPE tipo_alerta_enum AS ENUM (
    'TEMP_ALTA',
    'FUERA_RUTA',
    'BATERIA_BAJA'
);

-- ============================================
-- TABLA: USUARIO
-- ============================================

CREATE TABLE usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    rol rol_usuario_enum NOT NULL
);

-- ============================================
-- TABLA: EMPRESA
-- ============================================

CREATE TABLE empresa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(150) NOT NULL
);

-- ============================================
-- TABLA: IOT
-- ============================================

CREATE TABLE iot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_dispositivo VARCHAR(100) NOT NULL,
    estado_conexion VARCHAR(50) NOT NULL,
    ultimo_ping TIMESTAMP NOT NULL,
    firmware_version VARCHAR(50)
);

-- ============================================
-- TABLA: TRANSPORTE
-- ============================================

CREATE TABLE transporte (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    placa VARCHAR(20) UNIQUE NOT NULL,
    iot_id UUID NOT NULL,
    empresa_id UUID NOT NULL,
    estado estado_transporte_enum NOT NULL,
    capacidad DECIMAL(9,6),

    CONSTRAINT fk_transporte_iot
        FOREIGN KEY (iot_id) REFERENCES iot(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_transporte_empresa
        FOREIGN KEY (empresa_id) REFERENCES empresa(id)
        ON DELETE CASCADE
);

-- ============================================
-- TABLA: VIAJE
-- ============================================

CREATE TABLE viaje (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transporte_id UUID NOT NULL,
    limite_max_temp FLOAT NOT NULL,
    ruta_waypoints JSON NOT NULL,
    margen_desvio_km FLOAT,
    inicio_viaje TIMESTAMP,
    final_viaje TIMESTAMP,
    estado estado_viaje_enum NOT NULL DEFAULT 'pendiente',

    CONSTRAINT fk_viaje_transporte
        FOREIGN KEY (transporte_id) REFERENCES transporte(id)
        ON DELETE CASCADE
);

-- ============================================
-- TABLA: TELEMETRIA
-- ============================================

CREATE TABLE telemetria (
    id BIGSERIAL PRIMARY KEY,
    viaje_id UUID NOT NULL,
    lat DECIMAL(9,6) NOT NULL,
    lon DECIMAL(9,6) NOT NULL,
    temp DECIMAL(5,2) NOT NULL,
    humedad FLOAT,
    bateria INT,
    timestamp_sensor TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_telemetria_viaje
        FOREIGN KEY (viaje_id) REFERENCES viaje(id)
        ON DELETE CASCADE
);

-- ============================================
-- TABLA: INCIDENTE
-- ============================================

CREATE TABLE incidente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viaje_id UUID NOT NULL,
    telemetria_id BIGINT NOT NULL,
    tipo_alerta tipo_alerta_enum NOT NULL,
    valor_detectado FLOAT NOT NULL,
    umbral_permitido FLOAT NOT NULL,
    timestamp_bd TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_incidente_viaje
        FOREIGN KEY (viaje_id) REFERENCES viaje(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_incidente_telemetria
        FOREIGN KEY (telemetria_id) REFERENCES telemetria(id)
        ON DELETE CASCADE
);

-- ============================================
-- ÍNDICES
-- ============================================

CREATE INDEX idx_telemetria_viaje ON telemetria(viaje_id);
CREATE INDEX idx_incidente_viaje ON incidente(viaje_id);
CREATE INDEX idx_transporte_empresa ON transporte(empresa_id);
CREATE INDEX idx_viaje_transporte ON viaje(transporte_id);

-- ============================================
-- VALIDACIONES
-- ============================================

ALTER TABLE telemetria
ADD CONSTRAINT chk_temp_valida CHECK (temp >= -50 AND temp <= 100);

ALTER TABLE telemetria
ADD CONSTRAINT chk_humedad_valida CHECK (humedad >= 0 AND humedad <= 100);

ALTER TABLE telemetria
ADD CONSTRAINT chk_bateria_valida CHECK (bateria >= 0 AND bateria <= 100);

ALTER TABLE transporte
ADD CONSTRAINT chk_capacidad_valida CHECK (capacidad >= 0);

-- ============================================
-- FIN
-- ============================================
