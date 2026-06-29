import { Test, TestingModule } from '@nestjs/testing';
import { TransporteService } from './transporte.service';
import { DbService } from '../db/db.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('TransporteService', () => {
  let service: TransporteService;
  let dbService: jest.Mocked<DbService>;

  beforeEach(async () => {
    const dbMock = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransporteService,
        { provide: DbService, useValue: dbMock },
      ],
    }).compile();

    service = module.get<TransporteService>(TransporteService);
    dbService = module.get(DbService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debe devolver un array de transportes', async () => {
      const mockResult = [{ id: '1', placa: 'ABC-123' }];
      dbService.query.mockResolvedValue({ rows: mockResult } as any);

      const result = await service.findAll();
      expect(result).toEqual(mockResult);
      expect(dbService.query).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('debe devolver un transporte si existe', async () => {
      const mockResult = { id: '1', placa: 'ABC-123' };
      dbService.query.mockResolvedValue({ rows: [mockResult] } as any);

      const result = await service.findOne('1');
      expect(result).toEqual(mockResult);
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      dbService.query.mockResolvedValue({ rows: [] } as any);
      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('debe crear y devolver un transporte', async () => {
      const payload = { placa: 'XYZ-999', iot_id: 'iot-1', empresa_id: 'emp-1', estado: 'Activo' as const };
      dbService.query.mockResolvedValue({ rows: [{ id: '1', ...payload }] } as any);

      const result = await service.create(payload);
      expect(result.placa).toEqual(payload.placa);
    });
  });

  describe('update', () => {
    it('debe lanzar BadRequestException si no se envian campos', async () => {
      dbService.query.mockResolvedValue({ rows: [{ id: '1' }] } as any);
      await expect(service.update('1', {})).rejects.toThrow(BadRequestException);
    });

    it('debe actualizar campos', async () => {
      dbService.query.mockResolvedValue({ rows: [{ id: '1', placa: 'NEW' }] } as any);
      const result = await service.update('1', { placa: 'NEW' });
      expect(result.placa).toEqual('NEW');
    });
  });

  describe('delete', () => {
    it('debe eliminar transporte', async () => {
      dbService.query
        .mockResolvedValueOnce({ rows: [{ id: '1' }] } as any) // para el findOne interno
        .mockResolvedValueOnce({ rows: [] } as any);           // para el delete

      const result = await service.delete('1');
      expect(result.deleted).toBe(true);
    });
  });
});
