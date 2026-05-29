CREATE EXTENSION IF NOT EXISTS "pgcrypto";
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_usuario_enum') THEN
        CREATE TYPE rol_usuario_enum AS ENUM ('Admin', 'Operador', 'Auditor');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_transporte_enum') THEN
        CREATE TYPE estado_transporte_enum AS ENUM ('Activo', 'Mantenimiento');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_viaje_enum') THEN
        CREATE TYPE estado_viaje_enum AS ENUM (
            'pendiente',
            'en_curso',
            'pausado',
            'cancelado',
            'finalizado'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_alerta_enum') THEN
        CREATE TYPE tipo_alerta_enum AS ENUM (
            'TEMP_ALTA',
            'FUERA_RUTA',
            'BATERIA_BAJA'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    rol rol_usuario_enum NOT NULL
);

CREATE TABLE IF NOT EXISTS empresa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(150) NOT NULL
);

CREATE TABLE IF NOT EXISTS iot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_dispositivo VARCHAR(100) NOT NULL,
    estado_conexion VARCHAR(50) NOT NULL,
    ultimo_ping TIMESTAMP NOT NULL,
    firmware_version VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS transporte (
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

    CREATE TABLE IF NOT EXISTS sucursal (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id UUID NOT NULL,
        nombre VARCHAR(150) NOT NULL,
        direccion VARCHAR(255),
        lat DECIMAL(9,6) NOT NULL,
        lon DECIMAL(9,6) NOT NULL,

        CONSTRAINT fk_sucursal_empresa
        FOREIGN KEY (empresa_id) REFERENCES empresa(id)
        ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS viaje (
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

CREATE TABLE IF NOT EXISTS telemetria (
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

CREATE TABLE IF NOT EXISTS incidente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viaje_id UUID NOT NULL,
    telemetria_id BIGINT NOT NULL,
    tipo_alerta tipo_alerta_enum NOT NULL,
    valor_detectado FLOAT NOT NULL,
    umbral_permitido FLOAT NOT NULL,
    timestamp_bd TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    timestamp_fin TIMESTAMP,
    valor_pico FLOAT,

    CONSTRAINT fk_incidente_viaje
        FOREIGN KEY (viaje_id) REFERENCES viaje(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_incidente_telemetria
        FOREIGN KEY (telemetria_id) REFERENCES telemetria(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telemetria_viaje ON telemetria(viaje_id);
CREATE INDEX IF NOT EXISTS idx_incidente_viaje ON incidente(viaje_id);
CREATE INDEX IF NOT EXISTS idx_transporte_empresa ON transporte(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sucursal_empresa ON sucursal(empresa_id);
CREATE INDEX IF NOT EXISTS idx_viaje_transporte ON viaje(transporte_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_temp_valida'
    ) THEN
        ALTER TABLE telemetria
            ADD CONSTRAINT chk_temp_valida CHECK (temp >= -50 AND temp <= 100);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_humedad_valida'
    ) THEN
        ALTER TABLE telemetria
            ADD CONSTRAINT chk_humedad_valida CHECK (humedad >= 0 AND humedad <= 100);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_bateria_valida'
    ) THEN
        ALTER TABLE telemetria
            ADD CONSTRAINT chk_bateria_valida CHECK (bateria >= 0 AND bateria <= 100);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_capacidad_valida'
    ) THEN
        ALTER TABLE transporte
            ADD CONSTRAINT chk_capacidad_valida CHECK (capacidad >= 0);
    END IF;
END $$;

ALTER TYPE tipo_alerta_enum ADD VALUE IF NOT EXISTS 'TEMP_BAJA';
ALTER TYPE tipo_alerta_enum ADD VALUE IF NOT EXISTS 'SIN_SENAL';
ALTER TYPE tipo_alerta_enum ADD VALUE IF NOT EXISTS 'HUMEDAD_FUERA_RANGO';
ALTER TYPE tipo_alerta_enum ADD VALUE IF NOT EXISTS 'MKT_EXCEDIDO';
ALTER TYPE tipo_alerta_enum ADD VALUE IF NOT EXISTS 'APERTURA_NO_AUTORIZADA';

CREATE TABLE IF NOT EXISTS perfil_producto (
    id VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    limite_min_temp FLOAT NOT NULL,
    limite_max_temp FLOAT NOT NULL,
    limite_min_humedad FLOAT NOT NULL,
    limite_max_humedad FLOAT NOT NULL
);

INSERT INTO perfil_producto (id, nombre, limite_min_temp, limite_max_temp, limite_min_humedad, limite_max_humedad) VALUES
    ('lacteos', 'Lácteos (Leche, Quesos)', 0, 4, 60, 80),
    ('carnes', 'Carnes Frescas y Aves', -2, 2, 70, 85),
    ('congelados', 'Congelados Ultra (Pescados, Helados)', -25, -18, 0, 100),
    ('frutas', 'Frutas y Vegetales Frescos', 8, 12, 85, 95),
    ('medicamentos', 'Medicamentos (CRT - Temp Ambiente Controlada)', 15, 25, 35, 65)
ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    limite_min_temp = EXCLUDED.limite_min_temp,
    limite_max_temp = EXCLUDED.limite_max_temp,
    limite_min_humedad = EXCLUDED.limite_min_humedad,
    limite_max_humedad = EXCLUDED.limite_max_humedad;

ALTER TABLE empresa ADD COLUMN IF NOT EXISTS lat DECIMAL(9,6);
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS lon DECIMAL(9,6);

ALTER TABLE viaje ADD COLUMN IF NOT EXISTS sucursal_origen_id UUID;
ALTER TABLE viaje ADD COLUMN IF NOT EXISTS sucursal_destino_id UUID;
ALTER TABLE viaje ADD COLUMN IF NOT EXISTS limite_min_temp FLOAT;
ALTER TABLE viaje ADD COLUMN IF NOT EXISTS tipo_producto VARCHAR(100);
ALTER TABLE viaje ADD COLUMN IF NOT EXISTS valor_comercial DECIMAL(12,2);
ALTER TABLE viaje ADD COLUMN IF NOT EXISTS peso_kg DECIMAL(10,2);
ALTER TABLE viaje ADD COLUMN IF NOT EXISTS volumen_m3 DECIMAL(10,2);
ALTER TABLE viaje ADD COLUMN IF NOT EXISTS auditoria_ia TEXT;
ALTER TABLE viaje ADD COLUMN IF NOT EXISTS limite_min_humedad FLOAT;
ALTER TABLE viaje ADD COLUMN IF NOT EXISTS limite_max_humedad FLOAT;
ALTER TABLE viaje ADD COLUMN IF NOT EXISTS perfil_producto_id VARCHAR(50) REFERENCES perfil_producto(id) ON DELETE SET NULL;
ALTER TABLE telemetria ADD COLUMN IF NOT EXISTS compuerta_abierta BOOLEAN DEFAULT FALSE;


CREATE INDEX IF NOT EXISTS idx_viaje_sucursal_origen ON viaje(sucursal_origen_id);
CREATE INDEX IF NOT EXISTS idx_viaje_sucursal_destino ON viaje(sucursal_destino_id);

ALTER TABLE incidente ADD COLUMN IF NOT EXISTS resuelta BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS analisis_ia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viaje_id UUID NOT NULL REFERENCES viaje(id) ON DELETE CASCADE,
    telemetria_id BIGINT REFERENCES telemetria(id) ON DELETE CASCADE,
    incidente_id UUID REFERENCES incidente(id) ON DELETE CASCADE,
    nivel_riesgo VARCHAR(30) NOT NULL,       -- 'bajo', 'medio', 'alto', 'critico'
    diagnostico_tecnico TEXT NOT NULL,
    accion_mitigacion TEXT NOT NULL,
    fuente VARCHAR(50) NOT NULL,             -- 'groq_llm' o 'reglas_fallback'
    version_modelo VARCHAR(50) DEFAULT 'llama3-70b-8192',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analisis_ia_viaje ON analisis_ia(viaje_id);
-- ============================================
-- DATOS SEMILLA
-- ============================================

INSERT INTO usuario (email, password, rol) VALUES
    ('admin@coldcase.com', '$2b$10$FuV/ZFN0/hgSjv/3f8sXGedJCOy6pPE6ND111uP/3rxA3TBrR8YK.', 'Admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO empresa (id, nombre, lat, lon) VALUES
    ('11111111-1111-4111-8111-111111111111', 'Coldcase Central', 13.692900, -89.218200),
    ('22222222-2222-4222-8222-222222222222', 'Coldcase Occidente', 13.980000, -89.559700)
ON CONFLICT (id) DO NOTHING;

INSERT INTO iot (id, tipo_dispositivo, estado_conexion, ultimo_ping, firmware_version) VALUES
    ('33333333-3333-4333-8333-333333333333', 'Tracker GPS', 'online', CURRENT_TIMESTAMP, 'v1.0.0'),
    ('44444444-4444-4444-8444-444444444444', 'Tracker GPS', 'online', CURRENT_TIMESTAMP, 'v1.0.1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO transporte (id, placa, iot_id, empresa_id, estado, capacidad) VALUES
    ('55555555-5555-4555-8555-555555555555', 'P123-456', '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Activo', 12.500000),
    ('66666666-6666-4666-8666-666666666666', 'P789-012', '44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'Activo', 8.750000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sucursal (id, empresa_id, nombre, direccion, lat, lon) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Sucursal Central', 'Bulevar del Ejercito, San Salvador', 13.692900, -89.218200),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'Sucursal Metro', 'Colonia Escalon, San Salvador', 13.709500, -89.229900),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 'Sucursal Occidente', 'Centro de Santa Ana', 13.977000, -89.561400),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '22222222-2222-4222-8222-222222222222', 'Sucursal Oriente', 'Centro de San Miguel', 13.483900, -88.177300)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE viaje DROP CONSTRAINT IF EXISTS fk_viaje_sucursal_origen;
ALTER TABLE viaje DROP CONSTRAINT IF EXISTS fk_viaje_sucursal_destino;

ALTER TABLE viaje
    ADD CONSTRAINT fk_viaje_sucursal_origen
    FOREIGN KEY (sucursal_origen_id) REFERENCES sucursal(id)
    ON DELETE CASCADE;

ALTER TABLE viaje
    ADD CONSTRAINT fk_viaje_sucursal_destino
    FOREIGN KEY (sucursal_destino_id) REFERENCES sucursal(id)
    ON DELETE CASCADE;


-- Migración de esquema para bases de datos ya inicializadas:
ALTER TABLE incidente ADD COLUMN IF NOT EXISTS timestamp_fin TIMESTAMP;
ALTER TABLE incidente ADD COLUMN IF NOT EXISTS valor_pico FLOAT;
ALTER TABLE analisis_ia ALTER COLUMN telemetria_id DROP NOT NULL;
ALTER TABLE analisis_ia ADD COLUMN IF NOT EXISTS incidente_id UUID REFERENCES incidente(id) ON DELETE CASCADE;

-- Tabla para almacenar los eventos de estado/actualizaciones de incidente (Append-only)
CREATE TABLE IF NOT EXISTS incidente_evento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incidente_id UUID NOT NULL REFERENCES incidente(id) ON DELETE CASCADE,
    tipo_evento VARCHAR(50) NOT NULL, -- 'PICO_ACTUALIZADO', 'RESUELTO'
    valor_registrado FLOAT,
    timestamp_evento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- RIGID DATA INTEGRITY: IMMUTABILITY TRIGGERS
-- ============================================

-- Función para impedir eliminación de registros
CREATE OR REPLACE FUNCTION prevent_delete_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Operación no permitida: los registros en esta tabla son inmutables y no se pueden eliminar.';
END;
$$ LANGUAGE plpgsql;

-- Función para impedir actualización completa en tablas puramente inmutables
CREATE OR REPLACE FUNCTION prevent_update_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Operación no permitida: los registros en esta tabla son inmutables y no se pueden actualizar.';
END;
$$ LANGUAGE plpgsql;

-- Función para proteger los campos base de un incidente permitiendo solo la resolución
CREATE OR REPLACE FUNCTION prevent_update_incidente_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.id IS DISTINCT FROM NEW.id OR
       OLD.viaje_id IS DISTINCT FROM NEW.viaje_id OR
       OLD.telemetria_id IS DISTINCT FROM NEW.telemetria_id OR
       OLD.tipo_alerta IS DISTINCT FROM NEW.tipo_alerta OR
       OLD.valor_detectado IS DISTINCT FROM NEW.valor_detectado OR
       OLD.umbral_permitido IS DISTINCT FROM NEW.umbral_permitido OR
       OLD.timestamp_bd IS DISTINCT FROM NEW.timestamp_bd OR
       OLD.valor_pico IS DISTINCT FROM NEW.valor_pico THEN
        RAISE EXCEPTION 'Operación no permitida: los campos base de un incidente son inmutables. Solo se permite actualizar "resuelta" y "timestamp_fin".';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar triggers de eliminación
CREATE OR REPLACE TRIGGER trg_prevent_delete_incidente
BEFORE DELETE ON incidente
FOR EACH ROW
EXECUTE FUNCTION prevent_delete_immutable();

CREATE OR REPLACE TRIGGER trg_prevent_delete_incidente_evento
BEFORE DELETE ON incidente_evento
FOR EACH ROW
EXECUTE FUNCTION prevent_delete_immutable();

-- Aplicar triggers de modificación
CREATE OR REPLACE TRIGGER trg_prevent_update_incidente_evento
BEFORE UPDATE ON incidente_evento
FOR EACH ROW
EXECUTE FUNCTION prevent_update_immutable();

CREATE OR REPLACE TRIGGER trg_prevent_update_incidente_fields
BEFORE UPDATE ON incidente
FOR EACH ROW
EXECUTE FUNCTION prevent_update_incidente_fields();