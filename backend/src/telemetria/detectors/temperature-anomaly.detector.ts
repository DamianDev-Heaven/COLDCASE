import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AnomalyDetector, AnomalyResult } from './anomaly-detector.interface';
import { CreateTelemetriaDto } from '../dto/create-telemetria.dto';
import { IncidenteService } from '../../incidente/incidente.service';

interface ActiveIncidentRow {
  id: string;
  viaje_id: string;
  telemetria_id: number;
  tipo_alerta: string;
  valor_detectado: number;
  umbral_permitido: number;
  timestamp_bd: string;
  valor_pico: number;
}

@Injectable()
export class TemperatureAnomalyDetector implements AnomalyDetector {
  constructor(private readonly incidenteService: IncidenteService) {}

  async evaluate(
    payload: CreateTelemetriaDto,
    telemetriaId: number,
    viaje: {
      id: string;
      limite_max_temp: number;
      limite_min_temp?: number | null;
      estado: string;
    },
    client: PoolClient,
  ): Promise<AnomalyResult | null> {
    // 1. Consultar Excursión Activa (TEMP_ALTA)
    // Se considera activa si no existe un evento de tipo 'RESUELTO' para el incidente
    const activeIncidentResult = await client.query<ActiveIncidentRow>(
      `SELECT i.id, i.viaje_id, i.telemetria_id, i.tipo_alerta, i.valor_detectado, i.umbral_permitido, i.timestamp_bd,
              COALESCE((SELECT valor_registrado FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'PICO_ACTUALIZADO' ORDER BY timestamp_evento DESC LIMIT 1), i.valor_pico, i.valor_detectado) as valor_pico
       FROM incidente i
       WHERE i.viaje_id = $1 
         AND i.tipo_alerta = 'TEMP_ALTA' 
         AND NOT EXISTS (
             SELECT 1 FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'RESUELTO'
         )
       LIMIT 1`,
      [viaje.id],
    );
    const activeIncident = activeIncidentResult.rows[0];

    const tempAlta = payload.temp > viaje.limite_max_temp;

    if (tempAlta) {
      if (!activeIncident) {
        // Caso Alta + No Activa: Crear incidente abierto (inmutable)
        const newIncident = await this.incidenteService.create({
          viaje_id: viaje.id,
          telemetria_id: telemetriaId,
          tipo_alerta: 'TEMP_ALTA',
          valor_detectado: payload.temp,
          umbral_permitido: viaje.limite_max_temp,
          valor_pico: payload.temp,
          resuelta: false,
          query: (text, params) => client.query(text, params),
        });

        // Registrar primer evento de pico
        await client.query(
          "INSERT INTO incidente_evento (incidente_id, tipo_evento, valor_registrado) VALUES ($1, 'PICO_ACTUALIZADO', $2)",
          [newIncident.id, payload.temp],
        );

        return {
          incidente: newIncident,
          encolarIa: true,
          incidenteParaIa: newIncident,
        };
      } else {
        // Caso Alta + Activa: Registrar nuevo evento de pico si supera el pico actual
        const currentPico = Number(activeIncident.valor_pico);
        if (payload.temp > currentPico) {
          await client.query(
            "INSERT INTO incidente_evento (incidente_id, tipo_evento, valor_registrado) VALUES ($1, 'PICO_ACTUALIZADO', $2)",
            [activeIncident.id, payload.temp],
          );
          activeIncident.valor_pico = payload.temp;
        }
        return { incidente: activeIncident };
      }
    } else {
      // Caso Temperatura Normal
      if (activeIncident) {
        // Consultar los últimos 3 pings registrados
        const lastPingsResult = await client.query<{ temp: number }>(
          'SELECT temp FROM telemetria WHERE viaje_id = $1 ORDER BY timestamp_sensor DESC, id DESC LIMIT 3',
          [viaje.id],
        );
        const lastPings = lastPingsResult.rows;

        // Si hay al menos 3 pings y todos son normales
        const gracePeriodMet =
          lastPings.length >= 3 &&
          lastPings.every((p) => Number(p.temp) <= viaje.limite_max_temp);

        if (gracePeriodMet) {
          // Registrar evento de resolución inmutable
          await client.query(
            "INSERT INTO incidente_evento (incidente_id, tipo_evento) VALUES ($1, 'RESUELTO')",
            [activeIncident.id],
          );

          // Construir respuesta de incidente resuelto
          const resolvedIncidente = {
            ...activeIncident,
            resuelta: true,
            timestamp_fin: new Date().toISOString(),
          };

          return {
            incidente: resolvedIncidente,
            encolarIa: true,
            incidenteParaIa: resolvedIncidente,
          };
        } else {
          return { incidente: activeIncident };
        }
      }
    }

    return null;
  }
}
