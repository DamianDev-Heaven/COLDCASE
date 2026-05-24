import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../db/db.service';
import { IaAnalysisService } from './ia-analysis.service';

// ── Mocks ─────────────────────────────────────────

const configService = {
  get: jest.fn((key: string) => {
    if (key === 'AI_ANALYSIS_MODE') return 'deterministic';
    if (key === 'OSRM_BASE_URL') return 'https://osrm.test';
    return undefined;
  }),
};

const dbService = {
  query: jest.fn(),
};

const mockGroqClient = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
};

const mockZepClient = {
  memory: {
    get: jest.fn(),
    add: jest.fn(),
    getSession: jest.fn(),
    addSession: jest.fn(),
  },
};

// ── Helper para crear el módulo de test ───────────

async function createTestService(overrides?: {
  groq?: unknown;
  zep?: unknown;
}) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      IaAnalysisService,
      { provide: ConfigService, useValue: configService },
      { provide: DbService, useValue: dbService },
      { provide: 'GROQ_CLIENT', useValue: overrides?.groq ?? null },
      { provide: 'ZEP_CLIENT', useValue: overrides?.zep ?? null },
    ],
  }).compile();

  return moduleRef.get(IaAnalysisService);
}

// ── Tests ─────────────────────────────────────────

describe('IaAnalysisService', () => {
  let service: IaAnalysisService;

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    (globalThis as typeof globalThis & { fetch?: unknown }).fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          routes: [
            {
              distance: 1800,
              geometry: {
                coordinates: [
                  [-89.2182, 13.6929],
                  [-89.2045, 13.7001],
                  [-89.1882, 13.7085],
                ],
              },
            },
          ],
        }),
      }) as never;

    service = await createTestService();
  });

  // ── Test existente preservado ────────────────────

  it('marks a high deviation and critical temperature as critical', async () => {
    const result = await service.analizarEvento({
      iot_id: 'iot-demo-01',
      temperaturaActual: 11.2,
      bateriaActual: 9,
      limite_max_temp: 5,
      margen_desvio_km: 4,
      latitudActual: 13.7441,
      longitudActual: -89.2752,
      ruta_waypoints: {
        waypoints: [
          { lat: 13.6929, lon: -89.2182 },
          { lat: 13.7001, lon: -89.2045 },
          { lat: 13.7085, lon: -89.1882 },
        ],
      },
      modo: 'deterministic',
    });

    expect(result.nivel_riesgo).toBe('CRITICO');
    expect(result.fuente).toBe('reglas');
    expect(result.contexto?.osrm_usado).toBe(true);
    expect(result.contexto?.distancia_ruta_km).toBeCloseTo(1.8, 1);
    expect(result.contexto?.desvio_km ?? 0).toBeGreaterThan(5);
  });

  // ── analizarEventoEnTiempoReal ──────────────────

  describe('analizarEventoEnTiempoReal', () => {
    const viajeId = '77777777-7777-4777-8777-777777777777';
    const telemetriaInput = {
      id: 1001,
      viaje_id: viajeId,
      lat: 13.7001,
      lon: -89.2003,
      temp: 6.5,
      humedad: 68,
      bateria: 91,
      timestamp_sensor: '2026-05-23T18:00:00Z',
    };

    const viajeMetadata = {
      tipo_producto: 'Medicamentos',
      valor_comercial: 12500,
      limite_max_temp: 5,
      limite_min_temp: 2,
    };

    const persistedRow = {
      id: 'aaaaaaaa-1111-1111-1111-111111111111',
      viaje_id: viajeId,
      telemetria_id: 1001,
      nivel_riesgo: 'alto',
      diagnostico_tecnico: 'Diagnóstico test',
      accion_mitigacion: 'Acción test',
      fuente: 'groq_llm',
      version_modelo: 'llama3-70b-8192',
      created_at: new Date(),
    };

    beforeEach(() => {
      // Mock viaje metadata query
      dbService.query.mockImplementation((sql: string) => {
        if (sql.includes('tipo_producto')) {
          return Promise.resolve({ rows: [viajeMetadata] });
        }
        if (sql.includes('INSERT INTO analisis_ia')) {
          return Promise.resolve({ rows: [persistedRow] });
        }
        return Promise.resolve({ rows: [] });
      });
    });

    it('persists LLM result when Groq succeeds', async () => {
      const groqResponse = {
        nivel_riesgo: 'alto',
        diagnostico_tecnico: 'Temperatura fuera de rango',
        accion_mitigacion: 'Verificar refrigeración',
      };

      mockGroqClient.chat.completions.create.mockResolvedValueOnce({
        choices: [
          {
            message: { content: JSON.stringify(groqResponse) },
          },
        ],
      });

      service = await createTestService({
        groq: mockGroqClient,
        zep: null,
      });

      const result = await service.analizarEventoEnTiempoReal(
        viajeId,
        telemetriaInput,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(persistedRow.id);

      // Verifica que se llamó al INSERT
      const insertCall = dbService.query.mock.calls.find(
        (call: string[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO analisis_ia'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toContain(viajeId);
    });

    it('falls back to deterministic rules when Groq fails', async () => {
      mockGroqClient.chat.completions.create.mockRejectedValueOnce(
        new Error('Groq API timeout'),
      );

      service = await createTestService({
        groq: mockGroqClient,
        zep: null,
      });

      const result = await service.analizarEventoEnTiempoReal(
        viajeId,
        telemetriaInput,
      );

      expect(result).toBeDefined();

      // Verifica que el INSERT usó fuente 'reglas_fallback'
      const insertCall = dbService.query.mock.calls.find(
        (call: string[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO analisis_ia'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1]).toContain('reglas_fallback');
    });

    it('falls back when Groq returns invalid JSON structure', async () => {
      mockGroqClient.chat.completions.create.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ invalid_key: 'bad data' }),
            },
          },
        ],
      });

      service = await createTestService({
        groq: mockGroqClient,
        zep: null,
      });

      const result = await service.analizarEventoEnTiempoReal(
        viajeId,
        telemetriaInput,
      );

      expect(result).toBeDefined();

      const insertCall = dbService.query.mock.calls.find(
        (call: string[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO analisis_ia'),
      );
      expect(insertCall![1]).toContain('reglas_fallback');
    });

    it('falls back when Groq client is null (no API key)', async () => {
      service = await createTestService({ groq: null, zep: null });

      const result = await service.analizarEventoEnTiempoReal(
        viajeId,
        telemetriaInput,
      );

      expect(result).toBeDefined();

      const insertCall = dbService.query.mock.calls.find(
        (call: string[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO analisis_ia'),
      );
      expect(insertCall![1]).toContain('reglas_fallback');
    });

    it('handles Zep failure silently without crashing', async () => {
      mockZepClient.memory.get.mockRejectedValueOnce(
        new Error('Zep connection refused'),
      );

      service = await createTestService({
        groq: null,
        zep: mockZepClient,
      });

      // Should NOT throw despite Zep error
      const result = await service.analizarEventoEnTiempoReal(
        viajeId,
        telemetriaInput,
      );

      expect(result).toBeDefined();
    });
  });

  // ── obtenerHistorialAnalisis ────────────────────

  describe('obtenerHistorialAnalisis', () => {
    it('returns records ordered by created_at DESC', async () => {
      const mockRows = [
        {
          id: 'aaa',
          viaje_id: '77777777-7777-4777-8777-777777777777',
          telemetria_id: 1002,
          nivel_riesgo: 'alto',
          diagnostico_tecnico: 'Segundo análisis',
          accion_mitigacion: 'Acción 2',
          fuente: 'groq_llm',
          version_modelo: 'llama3-70b-8192',
          created_at: new Date('2026-05-23T19:00:00Z'),
        },
        {
          id: 'bbb',
          viaje_id: '77777777-7777-4777-8777-777777777777',
          telemetria_id: 1001,
          nivel_riesgo: 'medio',
          diagnostico_tecnico: 'Primer análisis',
          accion_mitigacion: 'Acción 1',
          fuente: 'reglas_fallback',
          version_modelo: 'reglas_deterministas_v1',
          created_at: new Date('2026-05-23T18:00:00Z'),
        },
      ];

      dbService.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await service.obtenerHistorialAnalisis(
        '77777777-7777-4777-8777-777777777777',
      );

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('aaa');
      expect(result[1].id).toBe('bbb');

      // Verify the query uses ORDER BY created_at DESC
      expect(dbService.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        ['77777777-7777-4777-8777-777777777777'],
      );
    });
  });
});
