import { ZepClient } from '@getzep/zep-cloud';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Cargar variables de entorno del archivo .env de la raíz del proyecto
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runDemo() {
  const apiKey = process.env.ZEP_API_KEY;
  if (!apiKey) {
    console.error('❌ ERROR: ZEP_API_KEY no está configurada en tus variables de entorno.');
    process.exit(1);
  }

  console.log('🔄 Inicializando ZepClient...');
  const client = new ZepClient({ apiKey });
  const graphId = 'coldcase-global-graph';

  try {
    // 1. REINICIAR EL GRAFO PARA ESTA PRUEBA
    console.log(`\n1️⃣  Reiniciando Standalone Graph para asegurar datos limpios: ${graphId}`);
    try {
      await client.graph.delete(graphId);
      console.log('🗑️  Grafo anterior eliminado con éxito.');
    } catch (e) {
      console.log('ℹ️  No existía un grafo anterior o ya estaba limpio.');
    }

    console.log('🏗️  Creando nuevo Standalone Graph...');
    await client.graph.create({
      graphId,
      name: 'Coldcase Global Graph',
      description: 'Grafo de conocimiento unificado para anomalías y fallas de telemetría de COLDCASE'
    });
    console.log('✅ Grafo unificado creado correctamente.');

    // 2. INGERIR ESCENARIO RELACIONAL DE PRUEBA
    console.log('\n2️⃣  Ingiriendo escenario relacional de prueba...');

    // Interacción 1: Camión Azul en Viaje 101 con Falla de Temperatura
    console.log('   ➡ Registrando Interacción 1 (Viaje 101 - Camión Azul)...');
    await client.graph.add({
      graphId,
      data: 'Viaje ID: viaje-101\nAlerta del Sensor: Temp=22°C (Crítica), Batería=82% en Camión Azul. Conductor: Carlos.\nResolución de IA: Temperatura crítica detectada en el contenedor del Camión Azul. Se sospecha una fuga grave de refrigerante en el evaporador. Se solicita inspección técnica urgente.',
      type: 'text'
    });

    // Interacción 2: Camión Rojo en Viaje 102 con Falla de Batería
    console.log('   ➡ Registrando Interacción 2 (Viaje 102 - Camión Rojo)...');
    await client.graph.add({
      graphId,
      data: 'Viaje ID: viaje-102\nAlerta del Sensor: Temp=4°C (Normal), Batería=12% (Crítica) en Camión Rojo. Conductora: Ana.\nResolución de IA: Alerta de descarga acelerada de batería en el Camión Rojo. El alternador funciona bien, pero la batería requiere reemplazo inmediato al finalizar la ruta.',
      type: 'text'
    });

    // Interacción 3: Camión Azul en un viaje posterior (Viaje 105) con nueva falla de temperatura
    console.log('   ➡ Registrando Interacción 3 (Viaje 105 - Camión Azul, nuevo viaje)...');
    await client.graph.add({
      graphId,
      data: 'Viaje ID: viaje-105\nAlerta del Sensor: Temp=20°C (Alta) en Camión Azul. Conductor: Marcos.\nResolución de IA: Nueva alerta de temperatura fuera de rango en Camión Azul. Esto corrobora el reporte previo del viaje-101 sobre una fuga de refrigerante en el evaporador no solucionada en el taller.',
      type: 'text'
    });

    console.log('✅ Escenario de prueba enviado correctamente a Zep Graph.');

    // 3. ESPERAR A LA EXTRACCIÓN ASÍNCRONA DE ENTIDADES Y RELACIONES
    console.log('\n3️⃣  Esperando extracción asíncrona de entidades y relaciones...');
    console.log('   Zep Cloud procesa el texto en segundo plano usando LLMs para extraer los nodos y conexiones.');
    console.log('   (Esperando 12 segundos para dar tiempo al procesamiento de Zep...)');
    
    // Mostramos un timer simple
    for (let i = 12; i > 0; i--) {
      process.stdout.write(`   ⏳ Quedan ${i} segundos...\r`);
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log('\n   ✨ Tiempo de espera concluido.');

    // 4. CONSULTA 1: BUSCAR EL HISTORIAL DE FALLAS DE TEMPERATURA EN EL CAMIÓN AZUL
    console.log('\n4️⃣  HACIENDO CONSULTA 1: "Fallas de temperatura en Camión Azul"');
    console.log('   (Esta búsqueda semántica debería devolver las relaciones con la fuga de refrigerante y el evaporador)');
    
    const res1 = await client.graph.search({
      graphId,
      query: 'Fallas de temperatura en Camión Azul'
    });

    const edges1 = res1.edges || [];
    console.log(`\n📊 Relaciones encontradas para Consulta 1 (${edges1.length}):`);
    if (edges1.length === 0) {
      console.log('   ⚠️ Zep Cloud aún está procesando la extracción. Vuelve a ejecutar el script en unos momentos para ver las relaciones.');
    } else {
      edges1.forEach((edge, idx) => {
        console.log(`  [Enlace ${idx + 1}] Relación: ${edge.name}`);
        console.log(`               Hecho: ${edge.fact}`);
        console.log(`               Conexión: Source UUID (${edge.sourceNodeUuid}) ➔ Target UUID (${edge.targetNodeUuid})`);
        console.log('  --------------------------------------------------------------------------------');
      });
    }

    // 5. CONSULTA 2: BUSCAR EL HISTORIAL DE PROBLEMAS DEL CAMIÓN ROJO
    console.log('\n5️⃣  HACIENDO CONSULTA 2: "Problemas del Camión Rojo"');
    console.log('   (Esta búsqueda debería devolver la relación de la batería baja de Ana en el viaje-102)');

    const res2 = await client.graph.search({
      graphId,
      query: 'Problemas de batería o alternador en Camión Rojo'
    });

    const edges2 = res2.edges || [];
    console.log(`\n📊 Relaciones encontradas para Consulta 2 (${edges2.length}):`);
    if (edges2.length === 0) {
      console.log('   ⚠️ Zep Cloud aún está procesando la extracción.');
    } else {
      edges2.forEach((edge, idx) => {
        console.log(`  [Enlace ${idx + 1}] Relación: ${edge.name}`);
        console.log(`               Hecho: ${edge.fact}`);
        console.log(`               Conexión: Source UUID (${edge.sourceNodeUuid}) ➔ Target UUID (${edge.targetNodeUuid})`);
        console.log('  --------------------------------------------------------------------------------');
      });
    }

    console.log('\n✨ ¡Simulación relacional de Standalone Graphs completada con éxito!');
    console.log('💡 TIP: Puedes revisar tu Zep Cloud Dashboard en la sección "Standalone Graphs" para ver los nodos y enlaces creados visualmente.');

  } catch (error: any) {
    console.error('\n❌ Ocurrió un error en la simulación:', error.message || error);
    if (error.response) console.error(error.response.data);
  }
}

runDemo();
