-- ============================================
-- SEEDER COMPLETO DE DATOS COLDCASE (UUID COMPATIBLE)
-- ============================================

-- 1. Insertar Empresas Termosensibles y Logísticas Reales
INSERT INTO empresa (id, nombre, lat, lon) VALUES
    ('e1000000-1111-4111-8111-111111111111', 'FarmaCold El Salvador', 13.692900, -89.218200),
    ('e2000000-2222-4222-8222-222222222222', 'Lácteos del Volcán Santa Ana', 13.980000, -89.559700),
    ('e3000000-3333-4333-8333-333333333333', 'Distribuidora BioLogics Cuscatlán', 13.709500, -89.229900),
    ('e4000000-4444-4444-8444-444444444444', 'Carnes Selectas de Oriente', 13.483900, -88.177300),
    ('e5000000-5555-5555-8555-555555555555', 'Congelados del Pacífico S.A. de C.V.', 13.592500, -89.840000)
ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    lat = EXCLUDED.lat,
    lon = EXCLUDED.lon;

-- 2. Insertar Dispositivos IoT (Sensores de Alta Precisión y GPS)
INSERT INTO iot (id, tipo_dispositivo, estado_conexion, ultimo_ping, firmware_version) VALUES
    ('f1000000-1111-4111-8111-111111111111', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.0'),
    ('f2000000-2222-4222-8222-222222222222', 'Termómetro Humed-IoT v3', 'online', CURRENT_TIMESTAMP, 'v3.0.1'),
    ('f3000000-3333-4333-8333-333333333333', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.2'),
    ('f4000000-4444-4444-8444-444444444444', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.0'),
    ('f5000000-5555-5555-8555-555555555555', 'Termómetro Humed-IoT v3', 'offline', CURRENT_TIMESTAMP - INTERVAL '2 hours', 'v3.0.0'),
    ('f6000000-6666-6666-8666-666666666666', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.5'),
    ('f7000000-7777-7777-8777-777777777777', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.0'),
    ('f8000000-8888-8888-8888-888888888888', 'Termómetro Humed-IoT v3', 'online', CURRENT_TIMESTAMP, 'v3.0.2'),
    ('f9000000-9999-9999-8999-999999999999', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.0'),
    ('fa000000-aaaa-aaaa-baaa-aaaaaaaaaaaa', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.1')
ON CONFLICT (id) DO UPDATE SET
    tipo_dispositivo = EXCLUDED.tipo_dispositivo,
    estado_conexion = EXCLUDED.estado_conexion,
    ultimo_ping = EXCLUDED.ultimo_ping,
    firmware_version = EXCLUDED.firmware_version;

-- 3. Insertar Vehículos de Transporte Logístico Refrigerado
INSERT INTO transporte (id, placa, iot_id, empresa_id, estado, capacidad) VALUES
    ('b1000000-1111-4111-8111-111111111111', 'P305-124', 'f1000000-1111-4111-8111-111111111111', 'e1000000-1111-4111-8111-111111111111', 'Activo', 15.00),
    ('b2000000-2222-4222-8222-222222222222', 'P456-789', 'f2000000-2222-4222-8222-222222222222', 'e2000000-2222-4222-8222-222222222222', 'Activo', 5.50),
    ('b3000000-3333-4333-8333-333333333333', 'P892-044', 'f3000000-3333-4333-8333-333333333333', 'e3000000-3333-4333-8333-333333333333', 'Activo', 12.00),
    ('b4000000-4444-4444-8444-444444444444', 'RE-49021', 'f4000000-4444-4444-8444-444444444444', 'e4000000-4444-4444-8444-444444444444', 'Activo', 24.50),
    ('b5000000-5555-5555-8555-555555555555', 'P102-398', 'f5000000-5555-5555-8555-555555555555', 'e5000000-5555-5555-8555-555555555555', 'Mantenimiento', 8.20),
    ('b6000000-6666-6666-8666-666666666666', 'P811-923', 'f6000000-6666-6666-8666-666666666666', 'e1000000-1111-4111-8111-111111111111', 'Activo', 6.00),
    ('b7000000-7777-7777-8777-777777777777', 'P902-881', 'f7000000-7777-7777-8777-777777777777', 'e2000000-2222-4222-8222-222222222222', 'Activo', 9.50),
    ('b8000000-8888-8888-8888-888888888888', 'P341-290', 'f8000000-8888-8888-8888-888888888888', 'e3000000-3333-4333-8333-333333333333', 'Activo', 14.00),
    ('b9000000-9999-9999-8999-999999999999', 'P239-112', 'f9000000-9999-9999-8999-999999999999', 'e4000000-4444-4444-8444-444444444444', 'Activo', 18.00),
    ('ba000000-aaaa-aaaa-baaa-aaaaaaaaaaaa', 'P778-904', 'fa000000-aaaa-aaaa-baaa-aaaaaaaaaaaa', 'e5000000-5555-5555-8555-555555555555', 'Activo', 10.50)
ON CONFLICT (id) DO UPDATE SET
    placa = EXCLUDED.placa,
    iot_id = EXCLUDED.iot_id,
    empresa_id = EXCLUDED.empresa_id,
    estado = EXCLUDED.estado,
    capacidad = EXCLUDED.capacidad;

-- 4. Insertar Sucursales/Nodos Logísticos Distribuidos por El Salvador
INSERT INTO sucursal (id, empresa_id, nombre, direccion, lat, lon) VALUES
    -- Sucursales de FarmaCold
    ('c1000000-1111-4111-8111-111111111111', 'e1000000-1111-4111-8111-111111111111', 'FarmaCold SS - Hub Central', 'Bulevar Los Próceres, San Salvador', 13.684100, -89.236000),
    ('c1100000-1111-4111-8111-111111111111', 'e1000000-1111-4111-8111-111111111111', 'FarmaCold Santa Ana - Distribuidora', 'Avenida Independencia, Santa Ana', 13.978900, -89.554000),
    ('c1200000-1111-4111-8111-111111111111', 'e1000000-1111-4111-8111-111111111111', 'FarmaCold San Miguel - Farmacia Hospital', 'Ruta Militar, San Miguel', 13.488000, -88.173000),
    -- Sucursales de Lácteos del Volcán
    ('c2000000-2222-4222-8222-222222222222', 'e2000000-2222-4222-8222-222222222222', 'Lácteos del Volcán - Planta Procesadora', 'Carretera al Volcán, Santa Ana', 13.955000, -89.600000),
    ('c2100000-2222-4222-8222-222222222222', 'e2000000-2222-4222-8222-222222222222', 'Lácteos del Volcán - CD San Salvador', 'Zona Industrial Soyapango, San Salvador', 13.702000, -89.155000),
    -- Sucursales de BioLogics Cuscatlán
    ('c3000000-3333-4333-8333-333333333333', 'e3000000-3333-4333-8333-333333333333', 'BioLogics - Laboratorio y Despacho', 'Antiguo Cuscatlán, La Libertad', 13.673800, -89.251400),
    ('c3100000-3333-4333-8333-333333333333', 'e3000000-3333-4333-8333-333333333333', 'BioLogics Sonsonate - Depósito Regional', 'Avenida Otoniel Alabi, Sonsonate', 13.718000, -89.724000),
    -- Sucursales de Carnes Selectas
    ('c4000000-4444-4444-8444-444444444444', 'e4000000-4444-4444-8444-444444444444', 'Carnes Selectas SM - Frigorífico Principal', 'Desvío a La Unión, San Miguel', 13.492000, -88.160000),
    ('c4100000-4444-4444-8444-444444444444', 'e4000000-4444-4444-8444-444444444444', 'Carnes Selectas Usulután - Sucursal', 'Centro de Usulután', 13.344000, -88.441000),
    -- Sucursales de Congelados del Pacífico
    ('c5000000-5555-5555-8555-555555555555', 'e5000000-5555-5555-8555-555555555555', 'Congelados del Pacífico - Terminal Marítima', 'Puerto de Acajutla, Sonsonate', 13.574400, -89.824000),
    ('c5100000-5555-5555-8555-555555555555', 'e5000000-5555-5555-8555-555555555555', 'Congelados del Pacífico - CD San Salvador', 'San Jacinto, San Salvador', 13.682000, -89.186000)
ON CONFLICT (id) DO UPDATE SET
    empresa_id = EXCLUDED.empresa_id,
    nombre = EXCLUDED.nombre,
    direccion = EXCLUDED.direccion,
    lat = EXCLUDED.lat,
    lon = EXCLUDED.lon;

-- 5. Insertar Viajes Históricos y en Curso con Perfiles de Producto Reales
INSERT INTO viaje (
    id, transporte_id, limite_max_temp, limite_min_temp, ruta_waypoints, margen_desvio_km,
    inicio_viaje, final_viaje, estado, sucursal_origen_id, sucursal_destino_id,
    tipo_producto, valor_comercial, peso_kg, volumen_m3, perfil_producto_id,
    limite_min_humedad, limite_max_humedad
) VALUES
    -- Viaje 1: Finalizado - Transporte de Vacunas (Medicamentos)
    ('d1000000-1111-4111-8111-111111111111', 
     'b1000000-1111-4111-8111-111111111111', 
     25.00, 15.00, 
     '[{"lat":13.6841,"lon":-89.2360},{"lat":13.7500,"lon":-89.4000},{"lat":13.9789,"lon":-89.5540}]'::json, 
     0.15, 
     CURRENT_TIMESTAMP - INTERVAL '3 days', 
     CURRENT_TIMESTAMP - INTERVAL '2 days 20 hours', 
     'finalizado', 
     'c1000000-1111-4111-8111-111111111111', 
     'c1100000-1111-4111-8111-111111111111',
     'Vacunas Pediátricas e Insulina', 48500.00, 320.00, 1.80, 'medicamentos', 35.0, 65.0),

    -- Viaje 2: Finalizado - Transporte de Quesos (Lácteos)
    ('d2000000-2222-4222-8222-222222222222', 
     'b2000000-2222-4222-8222-222222222222', 
     4.00, 0.00, 
     '[{"lat":13.9550,"lon":-89.6000},{"lat":13.8000,"lon":-89.3500},{"lat":13.7020,"lon":-89.1550}]'::json, 
     0.25, 
     CURRENT_TIMESTAMP - INTERVAL '1 day 5 hours', 
     CURRENT_TIMESTAMP - INTERVAL '1 day 1 hour', 
     'finalizado', 
     'c2000000-2222-4222-8222-222222222222', 
     'c2100000-2222-4222-8222-222222222222',
     'Queso Cheddar y Crema Premium', 12400.00, 1500.00, 4.50, 'lacteos', 60.0, 80.0),

    -- Viaje 3: Pendiente - Distribución Sonsonate (Biológicos)
    ('d3000000-3333-4333-8333-333333333333', 
     'b3000000-3333-4333-8333-333333333333', 
     25.00, 15.00, 
     '[{"lat":13.6738,"lon":-89.2514},{"lat":13.6900,"lon":-89.4500},{"lat":13.7180,"lon":-89.7240}]'::json, 
     0.15, 
     NULL, NULL, 
     'pendiente', 
     'c3000000-3333-4333-8333-333333333333', 
     'c3100000-3333-4333-8333-333333333333',
     'Insulina y Reactivos de Laboratorio', 35000.00, 180.00, 0.90, 'medicamentos', 35.0, 65.0),

    -- Viaje 4: Finalizado con Alertas - Carnes Frescas (Carnes)
    ('d4000000-4444-4444-8444-444444444444', 
     'b4000000-4444-4444-8444-444444444444', 
     2.00, -2.00, 
     '[{"lat":13.4920,"lon":-88.1600},{"lat":13.4000,"lon":-88.3000},{"lat":13.3440,"lon":-88.4410}]'::json, 
     0.20, 
     CURRENT_TIMESTAMP - INTERVAL '12 hours', 
     CURRENT_TIMESTAMP - INTERVAL '10 hours', 
     'finalizado', 
     'c4000000-4444-4444-8444-444444444444', 
     'c4100000-4444-4444-8444-444444444444',
     'Lomito de Res y Cortes Premium', 28900.00, 4500.00, 12.00, 'carnes', 70.0, 85.0),

    -- Viaje 5: Pendiente - Congelados de Exportación (Congelados)
    ('d5000000-5555-5555-8555-555555555555', 
     'ba000000-aaaa-aaaa-baaa-aaaaaaaaaaaa', 
     -18.00, -25.00, 
     '[{"lat":13.5744,"lon":-89.8240},{"lat":13.6200,"lon":-89.5000},{"lat":13.6820,"lon":-89.1860}]'::json, 
     0.10, 
     NULL, NULL, 
     'pendiente', 
     'c5000000-5555-5555-8555-555555555555', 
     'c5100000-5555-5555-8555-555555555555',
     'Mariscos Congelados para Exportación', 67000.00, 8500.00, 18.50, 'congelados', 0.0, 100.0)
ON CONFLICT (id) DO UPDATE SET
    transporte_id = EXCLUDED.transporte_id,
    limite_max_temp = EXCLUDED.limite_max_temp,
    limite_min_temp = EXCLUDED.limite_min_temp,
    ruta_waypoints = EXCLUDED.ruta_waypoints,
    margen_desvio_km = EXCLUDED.margen_desvio_km,
    estado = EXCLUDED.estado,
    sucursal_origen_id = EXCLUDED.sucursal_origen_id,
    sucursal_destino_id = EXCLUDED.sucursal_destino_id,
    tipo_producto = EXCLUDED.tipo_producto,
    valor_comercial = EXCLUDED.valor_comercial,
    peso_kg = EXCLUDED.peso_kg,
    volumen_m3 = EXCLUDED.volumen_m3,
    perfil_producto_id = EXCLUDED.perfil_producto_id,
    limite_min_humedad = EXCLUDED.limite_min_humedad,
    limite_max_humedad = EXCLUDED.limite_max_humedad;

-- 6. Insertar Telemetría Histórica Falsa para Simular Recorrido del Viaje 1
INSERT INTO telemetria (viaje_id, lat, lon, temp, humedad, bateria, compuerta_abierta, timestamp_sensor) VALUES
    ('d1000000-1111-4111-8111-111111111111', 13.684100, -89.236000, 18.2, 45.5, 98, false, CURRENT_TIMESTAMP - INTERVAL '2 days 23 hours 50 min'),
    ('d1000000-1111-4111-8111-111111111111', 13.702000, -89.290000, 18.5, 46.1, 97, false, CURRENT_TIMESTAMP - INTERVAL '2 days 23 hours 40 min'),
    ('d1000000-1111-4111-8111-111111111111', 13.725000, -89.340000, 19.1, 46.8, 96, false, CURRENT_TIMESTAMP - INTERVAL '2 days 23 hours 30 min'),
    ('d1000000-1111-4111-8111-111111111111', 13.750000, -89.400000, 20.4, 47.2, 95, false, CURRENT_TIMESTAMP - INTERVAL '2 days 23 hours 20 min'),
    ('d1000000-1111-4111-8111-111111111111', 13.820000, -89.450000, 21.0, 48.0, 94, false, CURRENT_TIMESTAMP - INTERVAL '2 days 23 hours 10 min'),
    ('d1000000-1111-4111-8111-111111111111', 13.910000, -89.500000, 20.2, 47.9, 93, false, CURRENT_TIMESTAMP - INTERVAL '2 days 23 hours 00 min'),
    ('d1000000-1111-4111-8111-111111111111', 13.978900, -89.554000, 19.5, 45.8, 92, false, CURRENT_TIMESTAMP - INTERVAL '2 days 22 hours 50 min')
ON CONFLICT DO NOTHING;

-- 7. Insertar Telemetría Histórica Falsa para Simular Recorrido del Viaje 2
INSERT INTO telemetria (viaje_id, lat, lon, temp, humedad, bateria, compuerta_abierta, timestamp_sensor) VALUES
    ('d2000000-2222-4222-8222-222222222222', 13.955000, -89.600000, 2.1, 72.0, 100, false, CURRENT_TIMESTAMP - INTERVAL '1 day 4 hours 50 min'),
    ('d2000000-2222-4222-8222-222222222222', 13.910000, -89.500000, 2.3, 73.1, 99, false, CURRENT_TIMESTAMP - INTERVAL '1 day 4 hours 40 min'),
    ('d2000000-2222-4222-8222-222222222222', 13.850000, -89.420000, 2.5, 74.0, 98, false, CURRENT_TIMESTAMP - INTERVAL '1 day 4 hours 30 min'),
    ('d2000000-2222-4222-8222-222222222222', 13.800000, -89.350000, 2.8, 74.5, 97, false, CURRENT_TIMESTAMP - INTERVAL '1 day 4 hours 20 min'),
    ('d2000000-2222-4222-8222-222222222222', 13.750000, -89.280000, 3.2, 75.1, 96, false, CURRENT_TIMESTAMP - INTERVAL '1 day 4 hours 10 min'),
    ('d2000000-2222-4222-8222-222222222222', 13.702000, -89.155000, 3.0, 73.8, 95, false, CURRENT_TIMESTAMP - INTERVAL '1 day 4 hours 00 min')
ON CONFLICT DO NOTHING;
