INSERT INTO viaje (
    id, transporte_id, limite_max_temp, limite_min_temp, 
    limite_max_humedad, limite_min_humedad,
    ruta_waypoints, margen_desvio_km, inicio_viaje, estado, 
    sucursal_origen_id, sucursal_destino_id, tipo_producto,
    perfil_producto_id
) VALUES (
    '99999999-9999-4999-8999-999999999999',
    '55555555-5555-4555-8555-555555555555',
    4.0, 0.0, 
    80.0, 60.0,
    '{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"LineString","coordinates":[[-89.2182,13.6929],[-89.5614,13.977]]},"properties":{"distancia_km":65.5,"ruta_origen":"osrm"}}]}',
    2.0,
    CURRENT_TIMESTAMP,
    'en_curso',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'Lácteos y Quesos',
    'lacteos'
) ON CONFLICT DO NOTHING;
