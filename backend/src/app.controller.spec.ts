import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbService } from './db/db.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('AppController', () => {
  let appController: AppController;
  let dbService: { query: jest.Mock };
  let iaQueue: { isPaused: jest.Mock };

  beforeEach(async () => {
    dbService = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    iaQueue = {
      isPaused: jest.fn().mockResolvedValue(false),
    };

    (globalThis as typeof globalThis & { fetch?: unknown }).fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ code: 'Ok' }),
      }) as never;

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DbService,
          useValue: dbService,
        },
        {
          provide: getQueueToken('ia-analysis-queue'),
          useValue: iaQueue,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('monitoring/coldchain', () => {
    it('should return ok status when infrastructure services are healthy', async () => {
      const result = await appController.getColdChainMonitoring();

      expect(result.status).toBe('ok');
      expect(result.infrastructure).toEqual({
        backend: true,
        database: true,
        redis: true,
        osrm: true,
      });
    });

    it('should throw ServiceUnavailableException when any infrastructure service is degraded', async () => {
      dbService.query.mockRejectedValueOnce(new Error('db down'));

      await expect(
        appController.getColdChainMonitoring(),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
