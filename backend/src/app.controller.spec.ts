import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbService } from './db/db.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DbService,
          useValue: {
            query: jest.fn().mockResolvedValue({ rows: [] }),
          },
        },
        {
          provide: getQueueToken('ia-analysis-queue'),
          useValue: {
            isPaused: jest.fn().mockResolvedValue(false),
          },
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
});
