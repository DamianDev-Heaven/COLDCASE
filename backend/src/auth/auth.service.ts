import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcrypt";
import { Pool } from "pg";

const DEFAULT_DB_HOST = "localhost";
const DEFAULT_DB_PORT = 5432;

@Injectable()
export class AuthService {
  private readonly pool: Pool;
  private readonly schemaReady: Promise<void>;

  constructor(private readonly jwtService: JwtService) {
    this.pool = new Pool({
      connectionString: this.resolveConnectionString(),
    });

    this.schemaReady = this.ensureSchema();
  }

  async register(email: string, password: string, rol: "Admin" | "Operador" | "Auditor") {
    await this.schemaReady;

    const existing = await this.pool.query(
      "SELECT id FROM usuario WHERE email = $1",
      [email.toLowerCase()],
    );

    if (existing.rowCount) {
      throw new BadRequestException("El correo ya esta registrado.");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await this.pool.query(
      "INSERT INTO usuario (email, password, rol) VALUES ($1, $2, $3) RETURNING id, email, rol",
      [email.toLowerCase(), passwordHash, rol],
    );

    const user = result.rows[0];
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      rol: user.rol,
    });

    return { accessToken, user };
  }

  async login(email: string, password: string) {
    await this.schemaReady;

    const result = await this.pool.query(
      "SELECT id, email, password, rol FROM usuario WHERE email = $1",
      [email.toLowerCase()],
    );

    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException("Credenciales invalidas.");
    }

    const matches = await bcrypt.compare(password, user.password);
    if (!matches) {
      throw new UnauthorizedException("Credenciales invalidas.");
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      rol: user.rol,
    });

    return { accessToken, user: { id: user.id, email: user.email, rol: user.rol } };
  }

  async verifyToken(token: string) {
    return this.jwtService.verifyAsync(token, {
      secret: process.env.JWT_SECRET ?? "change-me",
    });
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

  private async ensureSchema() {
    await this.pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");

    await this.pool.query(
      "DO $$ BEGIN CREATE TYPE rol_usuario AS ENUM ('Admin', 'Operador', 'Auditor'); EXCEPTION WHEN duplicate_object THEN null; END $$;",
    );

    await this.pool.query(
      "CREATE TABLE IF NOT EXISTS usuario (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email VARCHAR(150) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, rol rol_usuario NOT NULL);",
    );
  }
}
