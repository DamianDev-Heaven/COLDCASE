import { Injectable } from "@nestjs/common";
import { Pool, QueryResultRow } from "pg";

const DEFAULT_DB_HOST = "localhost";
const DEFAULT_DB_PORT = 5432;

@Injectable()
export class DbService {
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: this.resolveConnectionString(),
    });
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: Array<unknown>,
  ) {
    return this.pool.query<T>(text, params);
  }

  private resolveConnectionString() {
    if (process.env.DATABASE_URL) {
      return process.env.DATABASE_URL;
    }

    const user = process.env.DB_USER ?? "postgres";
    const password = process.env.DB_PASSWORD ?? "postgres";
    const host = process.env.DB_HOST ?? DEFAULT_DB_HOST;
    const port = process.env.DB_PORT ?? DEFAULT_DB_PORT;
    const dbName = process.env.DB_NAME ?? "postgres";

    return `postgresql://${user}:${password}@${host}:${port}/${dbName}`;
  }
}
