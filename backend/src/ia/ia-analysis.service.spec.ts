import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { DbService } from "../db/db.service";
import { IaAnalysisService } from "./ia-analysis.service";

describe("IaAnalysisService", () => {
  let service: IaAnalysisService;
  const configService = {
    get: jest.fn((key: string) => {
      if (key === "AI_ANALYSIS_MODE") {
        return "deterministic";
      }

      if (key === "OSRM_BASE_URL") {
        return "https://osrm.test";
      }

      return undefined;
    }),
  };

  const dbService = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    jest.restoreAllMocks();
    (globalThis as typeof globalThis & { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        IaAnalysisService,
        { provide: ConfigService, useValue: configService },
        { provide: DbService, useValue: dbService },
      ],
    }).compile();

    service = moduleRef.get(IaAnalysisService);
  });

  it("marks a high deviation and critical temperature as critical", async () => {
    const result = await service.analizarEvento({
      iot_id: "iot-demo-01",
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
      modo: "deterministic",
    });

    expect(result.nivel_riesgo).toBe("CRITICO");
    expect(result.fuente).toBe("reglas");
    expect(result.contexto?.osrm_usado).toBe(true);
    expect(result.contexto?.distancia_ruta_km).toBeCloseTo(1.8, 1);
    expect(result.contexto?.desvio_km ?? 0).toBeGreaterThan(5);
  });
});
