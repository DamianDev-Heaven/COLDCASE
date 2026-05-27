import { Test } from '@nestjs/testing';
import { PoolClient } from 'pg';
import { HumidityAnomalyDetector } from './humidity-anomaly.detector';
import { MktAnomalyDetector } from './mkt-anomaly.detector';
import { GateSecurityDetector } from './gate-security.detector';
import { IncidenteService } from '../../incidente/incidente.service';

const mockIncidenteService = {
  create: jest.fn(),
};

const createMockPoolClient = (options: {
  sucursales?: any[];
  telemetria?: any[];
  incidentes?: any[];
}) => {
  return {
    query: jest.fn().mockImplementation((text: string) => {
      if (text.includes('FROM sucursal')) {
        return Promise.resolve({ rows: options.sucursales || [] });
      }
      if (text.includes('FROM telemetria')) {
        return Promise.resolve({ rows: options.telemetria || [] });
      }
      if (text.includes('FROM incidente')) {
        return Promise.resolve({ rows: options.incidentes || [] });
      }
      return Promise.resolve({ rows: [] });
    }),
  } as unknown as PoolClient;
};

describe('Detectors de Anomalías de Telemetría', () => {
  let humidityDetector: HumidityAnomalyDetector;
  let mktDetector: MktAnomalyDetector;
  let gateSecurityDetector: GateSecurityDetector;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        HumidityAnomalyDetector,
        MktAnomalyDetector,
        GateSecurityDetector,
        { provide: IncidenteService, useValue: mockIncidenteService },
      ],
    }).compile();

    humidityDetector = moduleRef.get(HumidityAnomalyDetector);
    mktDetector = moduleRef.get(MktAnomalyDetector);
    gateSecurityDetector = moduleRef.get(GateSecurityDetector);
  });

  describe('HumidityAnomalyDetector', () => {
    it('debería retornar null si la humedad está dentro del rango', async () => {
      const client = createMockPoolClient({});
      const payload = {
        viaje_id: 'v-1',
        lat: 10,
        lon: 10,
        temp: 5,
        humedad: 70,
        timestamp_sensor: 'now',
      };
      const viaje = {
        id: 'v-1',
        limite_min_humedad: 60,
        limite_max_humedad: 80,
        estado: 'en_curso',
      };

      const result = await humidityDetector.evaluate(
        payload,
        100,
        viaje,
        client,
      );

      expect(result).toBeNull();
      expect(mockIncidenteService.create).not.toHaveBeenCalled();
    });

    it('debería registrar incidente si la humedad excede el rango máximo', async () => {
      const client = createMockPoolClient({ incidentes: [] });
      const payload = {
        viaje_id: 'v-1',
        lat: 10,
        lon: 10,
        temp: 5,
        humedad: 90,
        timestamp_sensor: 'now',
      };
      const viaje = {
        id: 'v-1',
        limite_min_humedad: 60,
        limite_max_humedad: 80,
        estado: 'en_curso',
      };
      const mockIncident = { id: 'inc-1', tipo_alerta: 'HUMEDAD_FUERA_RANGO' };
      mockIncidenteService.create.mockResolvedValue(mockIncident);

      const result = await humidityDetector.evaluate(
        payload,
        100,
        viaje,
        client,
      );

      expect(result).toEqual({ incidente: mockIncident });
      expect(mockIncidenteService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          viaje_id: 'v-1',
          tipo_alerta: 'HUMEDAD_FUERA_RANGO',
          valor_detectado: 90,
          umbral_permitido: 80,
        }),
      );
    });
  });

  describe('MktAnomalyDetector', () => {
    it('debería retornar null si hay menos de 5 lecturas de telemetría', async () => {
      const client = createMockPoolClient({
        telemetria: [{ temp: '5.0' }, { temp: '6.0' }],
      });
      const payload = {
        viaje_id: 'v-1',
        lat: 10,
        lon: 10,
        temp: 5,
        timestamp_sensor: 'now',
      };
      const viaje = { id: 'v-1', limite_max_temp: 10, estado: 'en_curso' };

      const result = await mktDetector.evaluate(payload, 100, viaje, client);

      expect(result).toBeNull();
      expect(mockIncidenteService.create).not.toHaveBeenCalled();
    });

    it('debería calcular MKT correctamente y registrar incidente si supera limite_max_temp', async () => {
      const client = createMockPoolClient({
        telemetria: [
          { temp: '15.0' },
          { temp: '15.0' },
          { temp: '15.0' },
          { temp: '15.0' },
          { temp: '15.0' },
        ],
        incidentes: [],
      });
      const payload = {
        viaje_id: 'v-1',
        lat: 10,
        lon: 10,
        temp: 15,
        timestamp_sensor: 'now',
      };
      const viaje = { id: 'v-1', limite_max_temp: 10, estado: 'en_curso' };
      const mockIncident = { id: 'inc-mkt', tipo_alerta: 'MKT_EXCEDIDO' };
      mockIncidenteService.create.mockResolvedValue(mockIncident);

      const result = await mktDetector.evaluate(payload, 100, viaje, client);

      expect(result).toEqual({ incidente: mockIncident });
      expect(mockIncidenteService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          viaje_id: 'v-1',
          tipo_alerta: 'MKT_EXCEDIDO',
          valor_detectado: 15,
          umbral_permitido: 10,
        }),
      );
    });
  });

  describe('GateSecurityDetector', () => {
    it('no debería alertar si la compuerta se abre cerca de la sucursal de origen (<100m)', async () => {
      const client = createMockPoolClient({
        sucursales: [{ id: 'origin-1', lat: '13.6929', lon: '-89.2182' }],
        incidentes: [],
      });
      const payload = {
        viaje_id: 'v-1',
        lat: 13.6931,
        lon: -89.2181,
        temp: 5,
        compuerta_abierta: true,
        timestamp_sensor: 'now',
      };
      const viaje = {
        id: 'v-1',
        sucursal_origen_id: 'origin-1',
        sucursal_destino_id: 'dest-1',
        estado: 'en_curso',
      };

      const result = await gateSecurityDetector.evaluate(
        payload,
        100,
        viaje,
        client,
      );

      expect(result).toBeNull();
      expect(mockIncidenteService.create).not.toHaveBeenCalled();
    });

    it('debería registrar incidente si la compuerta se abre en tránsito (>100m de sucursales)', async () => {
      const client = createMockPoolClient({
        sucursales: [
          { id: 'origin-1', lat: '13.6929', lon: '-89.2182' },
          { id: 'dest-1', lat: '13.7001', lon: '-89.2045' },
        ],
        incidentes: [],
      });
      const payload = {
        viaje_id: 'v-1',
        lat: 13.75,
        lon: -89.3,
        temp: 5,
        compuerta_abierta: true,
        timestamp_sensor: 'now',
      };
      const viaje = {
        id: 'v-1',
        sucursal_origen_id: 'origin-1',
        sucursal_destino_id: 'dest-1',
        estado: 'en_curso',
      };
      const mockIncident = {
        id: 'inc-gate',
        tipo_alerta: 'APERTURA_NO_AUTORIZADA',
      };
      mockIncidenteService.create.mockResolvedValue(mockIncident);

      const result = await gateSecurityDetector.evaluate(
        payload,
        100,
        viaje,
        client,
      );

      expect(result).toEqual({ incidente: mockIncident });
      expect(mockIncidenteService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          viaje_id: 'v-1',
          tipo_alerta: 'APERTURA_NO_AUTORIZADA',
          valor_detectado: 1,
          umbral_permitido: 0,
        }),
      );
    });
  });
});
