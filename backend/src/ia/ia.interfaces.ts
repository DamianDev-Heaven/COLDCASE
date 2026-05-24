/**
 * Tipos compartidos del módulo de IA — COLDCASE v2
 *
 * Estos tipos definen el contrato público del motor de análisis en tiempo real.
 * Son la interfaz que TelemetriaService usará para integrarse en el futuro.
 */

// ── Tipos de dominio ─────────────────────────────

export type NivelRiesgo = 'bajo' | 'medio' | 'alto' | 'critico';

export type FuenteAnalisis = 'groq_llm' | 'reglas_fallback';

// ── Entrada: datos de telemetría para el motor IA ─

export interface TelemetriaInput {
  id: number;
  viaje_id: string;
  lat: number | string;
  lon: number | string;
  temp: number | string;
  humedad?: number | null;
  bateria?: number | null;
  timestamp_sensor: string;
}

// ── Salida: resultado persistido en analisis_ia ───

export interface AnalisisIaResultado {
  id: string;
  viaje_id: string;
  telemetria_id: number;
  nivel_riesgo: NivelRiesgo;
  diagnostico_tecnico: string;
  accion_mitigacion: string;
  fuente: FuenteAnalisis;
  version_modelo: string;
  created_at: Date;
}

// ── Row type para queries PostgreSQL ──────────────

export interface AnalisisIaRow {
  id: string;
  viaje_id: string;
  telemetria_id: number;
  nivel_riesgo: string;
  diagnostico_tecnico: string;
  accion_mitigacion: string;
  fuente: string;
  version_modelo: string;
  created_at: Date;
}
