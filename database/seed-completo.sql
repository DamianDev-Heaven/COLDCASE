-- ============================================
-- SEEDER COMPLETO DE DATOS COLDCASE (EMPRESAS REALES DE EL SALVADOR)
-- ============================================

-- 1. Insertar Empresas Termosensibles y Logísticas Reales de El Salvador
INSERT INTO empresa (id, nombre, lat, lon) VALUES
    ('e1000000-1111-4111-8111-111111111111', 'Laboratorios Vijosa S.A. de C.V.', 13.673800, -89.251400),
    ('e2000000-2222-4222-8222-222222222222', 'Lácteos Yes / LACTOSA', 13.955000, -89.600000),
    ('e3000000-3333-4333-8333-333333333333', 'Super Selectos El Salvador', 13.709500, -89.229900),
    ('e4000000-4444-4444-8444-444444444444', 'Avícola Sello de Oro', 13.492000, -88.160000),
    ('e5000000-5555-5555-8555-555555555555', 'Walmart El Salvador S.A. de C.V.', 13.682000, -89.186000),
    ('e6000000-6666-6666-8666-666666666666', 'Industrias La Constancia S.A. de C.V. (ILC)', 13.705000, -89.215000),
    ('e7000000-7777-7777-8777-777777777777', 'Panificadora Bimbo de El Salvador', 13.693000, -89.175000),
    ('e8000000-8888-8888-8888-888888888888', 'Diana S.A. de C.V. (Boquitas Diana)', 13.681500, -89.162000),
    ('e9000000-9999-9999-8999-999999999999', 'Lido S.A. (Panificadora Lido)', 13.699500, -89.141200)
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
    ('fa000000-aaaa-aaaa-baaa-aaaaaaaaaaaa', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.1'),
    ('fb000000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.0'),
    ('fc000000-cccc-cccc-cccc-cccccccccccc', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.2'),
    ('fd000000-dddd-dddd-dddd-dddddddddddd', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.0'),
    ('fe000000-eeee-eeee-eeee-eeeeeeeeeeee', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.4'),
    ('ff000000-ffff-ffff-ffff-ffffffffffff', 'Termómetro Humed-IoT v3', 'online', CURRENT_TIMESTAMP, 'v3.0.3'),
    ('f0100000-0101-0101-0101-010101010101', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.0'),
    ('f0200000-0202-0202-0202-020202020202', 'Tracker Cold-GPS Pro', 'online', CURRENT_TIMESTAMP, 'v2.1.0')
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
    ('ba000000-aaaa-aaaa-baaa-aaaaaaaaaaaa', 'P778-904', 'fa000000-aaaa-aaaa-baaa-aaaaaaaaaaaa', 'e5000000-5555-5555-8555-555555555555', 'Activo', 10.50),
    ('bb000000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'P405-923', 'fb000000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'e6000000-6666-6666-8666-666666666666', 'Activo', 20.00),
    ('bc000000-cccc-cccc-cccc-cccccccccccc', 'P811-002', 'fc000000-cccc-cccc-cccc-cccccccccccc', 'e7000000-7777-7777-8777-777777777777', 'Activo', 6.50),
    ('bd000000-dddd-dddd-dddd-dddddddddddd', 'P923-114', 'fd000000-dddd-dddd-dddd-dddddddddddd', 'e8000000-8888-8888-8888-888888888888', 'Activo', 8.00),
    ('be000000-eeee-eeee-eeee-eeeeeeeeeeee', 'P302-556', 'fe000000-eeee-eeee-eeee-eeeeeeeeeeee', 'e9000000-9999-9999-8999-999999999999', 'Activo', 7.20),
    ('bf000000-ffff-ffff-ffff-ffffffffffff', 'P772-911', 'ff000000-ffff-ffff-ffff-ffffffffffff', 'e1000000-1111-4111-8111-111111111111', 'Activo', 4.50),
    ('b0100000-0101-0101-0101-010101010101', 'P192-332', 'f0100000-0101-0101-0101-010101010101', 'e2000000-2222-4222-8222-222222222222', 'Activo', 9.00)
ON CONFLICT (id) DO UPDATE SET
    placa = EXCLUDED.placa,
    iot_id = EXCLUDED.iot_id,
    empresa_id = EXCLUDED.empresa_id,
    estado = EXCLUDED.estado,
    capacidad = EXCLUDED.capacidad;

-- 4. Insertar Sucursales/Nodos Logísticos Distribuidos por El Salvador
INSERT INTO sucursal (id, empresa_id, nombre, direccion, lat, lon) VALUES
    -- Sucursales de Vijosa (Fármacos)
    ('c1000000-1111-4111-8111-111111111111', 'e1000000-1111-4111-8111-111111111111', 'Vijosa Megaplanta - Hub Central', 'Bulevar Monseñor Romero, Antiguo Cuscatlán', 13.673800, -89.251400),
    ('c1100000-1111-4111-8111-111111111111', 'e1000000-1111-4111-8111-111111111111', 'Vijosa Santa Ana - Distribuidora Norte', 'Avenida Independencia, Santa Ana', 13.978900, -89.554000),
    ('c1200000-1111-4111-8111-111111111111', 'e1000000-1111-4111-8111-111111111111', 'Vijosa San Miguel - Centro Regional', 'Ruta Militar, San Miguel', 13.488000, -88.173000),
    -- Sucursales de Lácteos Yes / LACTOSA
    ('c2000000-2222-4222-8222-222222222222', 'e2000000-2222-4222-8222-222222222222', 'Lácteos Yes - Planta Procesadora', 'Carretera al Volcán, Santa Ana', 13.955000, -89.600000),
    ('c2100000-2222-4222-8222-222222222222', 'e2000000-2222-4222-8222-222222222222', 'Lácteos Yes - CD Soyapango', 'Zona Industrial Soyapango, San Salvador', 13.702000, -89.155000),
    -- Sucursales de Super Selectos (Supermercados)
    ('c3000000-3333-4333-8333-333333333333', 'e3000000-3333-4333-8333-333333333333', 'Super Selectos - CD Masferrer', 'Avenida Masferrer Norte, San Salvador', 13.709500, -89.229900),
    ('c3100000-3333-4333-8333-333333333333', 'e3000000-3333-4333-8333-333333333333', 'Super Selectos Sonsonate - Tienda', 'Bulevar las Palmeras, Sonsonate', 13.718000, -89.724000),
    -- Sucursales de Avícola Sello de Oro (Pollos y Carnes)
    ('c4000000-4444-4444-8444-444444444444', 'e4000000-4444-4444-8444-444444444444', 'Sello de Oro SM - Frigorífico Principal', 'Desvío a La Unión, San Miguel', 13.492000, -88.160000),
    ('c4100000-4444-4444-8444-444444444444', 'e4000000-4444-4444-8444-444444444444', 'Sello de Oro Usulután - Distribuidora', 'Carretera Litoral, Usulután', 13.344000, -88.441000),
    -- Sucursales de Walmart El Salvador
    ('c5000000-5555-5555-8555-555555555555', 'e5000000-5555-5555-8555-555555555555', 'Walmart Acajutla - Terminal Marítima', 'Puerto de Acajutla, Sonsonate', 13.574400, -89.824000),
    ('c5100000-5555-5555-8555-555555555555', 'e5000000-5555-5555-8555-555555555555', 'Walmart Constitución - CD Mayorista', 'Bulevar Constitución, San Salvador', 13.731000, -89.201000),
    -- Sucursales de Industrias La Constancia (ILC)
    ('c6000000-6666-6666-8666-666666666666', 'e6000000-6666-6666-8666-666666666666', 'ILC Planta Central San Salvador', '53 Avenida Norte, San Salvador', 13.705000, -89.215000),
    ('c6100000-6666-6666-8666-666666666666', 'e6000000-6666-6666-8666-666666666666', 'ILC CD Oriente San Miguel', 'Avenida Roosevelt, San Miguel', 13.483900, -88.177300),
    ('c6200000-6666-6666-8666-666666666666', 'e6000000-6666-6666-8666-666666666666', 'ILC CD Occidente Santa Ana', 'Carretera Panamericana Km 65, Santa Ana', 13.980000, -89.559700),
    -- Sucursales de Panificadora Bimbo
    ('c7000000-7777-7777-8777-777777777777', 'e7000000-7777-7777-8777-777777777777', 'Bimbo CD Soyapango', 'Bulevar el Ejército Km 7, Soyapango', 13.693000, -89.175000),
    ('c7100000-7777-7777-8777-777777777777', 'e7000000-7777-7777-8777-777777777777', 'Bimbo Sucursal San Vicente', 'Centro de Distribución, San Vicente', 13.642000, -88.784000),
    -- Sucursales de Diana
    ('c8000000-8888-8888-8888-888888888888', 'e8000000-8888-8888-8888-888888888888', 'Diana CD Soyapango', 'Calle del Recreo, Soyapango', 13.681500, -89.162000),
    ('c8100000-8888-8888-8888-888888888888', 'e8000000-8888-8888-8888-888888888888', 'Diana Sucursal Santa Ana', 'Diagonal Norte, Santa Ana', 13.978000, -89.563000),
    -- Sucursales de Lido
    ('c9000000-9999-9999-8999-999999999999', 'e9000000-9999-9999-8999-999999999999', 'Lido CD Soyapango', 'Calle Antigua al Matazano, Soyapango', 13.699500, -89.141200),
    ('c9100000-9999-9999-8999-999999999999', 'e9000000-9999-9999-8999-999999999999', 'Lido Sucursal Sonsonate', 'Carretera a Acajutla, Sonsonate', 13.722000, -89.721000)
ON CONFLICT (id) DO UPDATE SET
    empresa_id = EXCLUDED.empresa_id,
    nombre = EXCLUDED.nombre,
    direccion = EXCLUDED.direccion,
    lat = EXCLUDED.lat,
    lon = EXCLUDED.lon;
