import { Test, TestingModule } from '@nestjs/testing';
import { TelemetriaService } from './telemetria.service';
import { DbService } from '../db/db.service';
import { IncidenteService } from '../incidente/incidente.service';
import { IaAnalysisService } from '../ia/ia-analysis.service';
import { TemperatureAnomalyDetector } from './detectors/temperature-anomaly.detector';
import { BatteryAnomalyDetector } from './detectors/battery-anomaly.detector';
import { RouteDeviationDetector } from './detectors/route-deviation.detector';
import { HumidityAnomalyDetector } from './detectors/humidity-anomaly.detector';
import { MktAnomalyDetector } from './detectors/mkt-anomaly.detector';
import { GateSecurityDetector } from './detectors/gate-security.detector';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('TelemetriaService', () => {
  let service: TelemetriaService;
  let dbService: jest.Mocked<DbService>;
  let ingestQueue: any;

  beforeEach(async () => {
    const dbMock = {
      query: jest.fn(),
      transaction: jest.fn(),
    };

    const queueMock = {
      add: jest.fn(),
      getJobCounts: jest.fn(),
      getJobs: jest.fn(),
    };

    const detectorMock = {
      evaluate: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetriaService,
        { provide: DbService, useValue: dbMock },
        { provide: IncidenteService, useValue: {} },
        { provide: IaAnalysisService, useValue: {} },
        { provide: getQueueToken('ia-analysis-queue'), useValue: queueMock },
        { provide: getQueueToken('telemetria-contingency-queue'), useValue: queueMock },
        { provide: getQueueToken('telemetria-ingest-queue'), useValue: queueMock },
        { provide: TemperatureAnomalyDetector, useValue: detectorMock },
        { provide: BatteryAnomalyDetector, useValue: detectorMock },
        { provide: RouteDeviationDetector, useValue: detectorMock },
        { provide: HumidityAnomalyDetector, useValue: detectorMock },
        { provide: MktAnomalyDetector, useValue: detectorMock },
        { provide: GateSecurityDetector, useValue: detectorMock },
      ],
    }).compile();

    service = module.get<TelemetriaService>(TelemetriaService);
    dbService = module.get(DbService);
    ingestQueue = module.get(getQueueToken('telemetria-ingest-queue'));
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('create (Ingesta asíncrona)', () => {
    it('debe encolar la telemetría en Redis correctamente', async () => {
      const payload = {
        viaje_id: 'viaje-123',
        lat: 13.6929,
        lon: -89.2182,
        temp: 5.5,
        timestamp_sensor: new Date().toISOString(),
      };

      ingestQueue.add.mockResolvedValue(true);

      const result = await service.create(payload);

      expect(result.status).toBe('accepted');
      expect(result.viaje_id).toBe(payload.viaje_id);
      expect(ingestQueue.add).toHaveBeenCalledWith(
        'process-ingest',
        payload,
        expect.objectContaining({
          jobId: `${payload.viaje_id}-${payload.timestamp_sensor}`,
        }),
      );
    });

    it('debe lanzar BadRequestException si Redis falla', async () => {
      const payload = {
        viaje_id: 'viaje-123',
        lat: 13.6929,
        lon: -89.2182,
        temp: 5.5,
        timestamp_sensor: new Date().toISOString(),
      };

      ingestQueue.add.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.create(payload)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('debe devolver la telemetría si existe', async () => {
      const mockData = { id: 1, viaje_id: '123', lat: '10', lon: '-10' };
      dbService.query.mockResolvedValue({ rows: [mockData] } as any);

      const result = await service.findOne(1);

      expect(result).toEqual(mockData);
      expect(dbService.query).toHaveBeenCalledWith(expect.any(String), [1]);
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      dbService.query.mockResolvedValue({ rows: [] } as any);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });
});
