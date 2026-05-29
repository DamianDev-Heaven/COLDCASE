import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';

const DEFAULT_DB_HOST = 'localhost';
const DEFAULT_DB_PORT = 5432;

@Injectable()
export class DbService implements OnModuleDestroy, OnModuleInit {
  private readonly pool: Pool;
  private readonly logger = new Logger(DbService.name);

  constructor() {
    this.pool = new Pool({
      connectionString: this.resolveConnectionString(),
    });
  }

  async onModuleInit() {
    const maxRetries = 5;
    const delayMs = 2000;
    let connected = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.query('SELECT 1');
        connected = true;
        break;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Error de conexión a la base de datos (Intento ${attempt}/${maxRetries}): ${errorMsg}`,
        );
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    if (!connected) {
      this.logger.error(
        'No se pudo establecer conexión con la base de datos tras reintentos.',
      );
      throw new Error('Database connection failed.');
    }

    this.logger.log('Conexión con la base de datos establecida correctamente.');
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: Array<unknown>,
  ) {
    return this.pool.query<T>(text, params);
  }

  async transaction<T>(handler: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private resolveConnectionString() {
    if (process.env.DATABASE_URL) {
      return process.env.DATABASE_URL;
    }

    const user = process.env.DB_USER ?? 'postgres';
    const password = process.env.DB_PASSWORD ?? 'postgres';
    const host = process.env.DB_HOST ?? DEFAULT_DB_HOST;
    const port = process.env.DB_PORT ?? DEFAULT_DB_PORT;
    const dbName = process.env.DB_NAME ?? 'postgres';

    return `postgresql://${user}:${password}@${host}:${port}/${dbName}`;
  }
}
