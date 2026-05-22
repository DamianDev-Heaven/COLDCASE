import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';

type Role = 'Admin' | 'Operador' | 'Auditor';

type UserRow = {
  id: string;
  email: string;
  password?: string;
  rol: Role;
};

type UserSummaryRow = Pick<UserRow, 'id' | 'email' | 'rol'>;

type JwtPayload = {
  sub: string;
  email: string;
  rol: Role;
};

const DEFAULT_DB_HOST = 'localhost';
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

  async register(email: string, password: string, rol: Role) {
    await this.schemaReady;

    const existing = await this.pool.query(
      'SELECT id FROM usuario WHERE email = $1',
      [email.toLowerCase()],
    );

    if (existing.rowCount) {
      throw new BadRequestException('El correo ya esta registrado.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await this.pool.query(
      'INSERT INTO usuario (email, password, rol) VALUES ($1, $2, $3) RETURNING id, email, rol',
      [email.toLowerCase(), passwordHash, rol],
    );

    const user = result.rows[0] as UserRow;

    return { user };
  }

  async login(email: string, password: string) {
    await this.schemaReady;

    const result = await this.pool.query<UserRow>(
      'SELECT id, email, password, rol FROM usuario WHERE email = $1',
      [email.toLowerCase()],
    );

    const user = result.rows[0];
    if (!user) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    if (!user.password) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    const matches = await bcrypt.compare(password, user.password);
    if (!matches) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    const accessToken = await this.jwtService.signAsync<JwtPayload>({
      sub: user.id,
      email: user.email,
      rol: user.rol,
    });

    return {
      accessToken,
      user: { id: user.id, email: user.email, rol: user.rol },
    };
  }

  async listUsers() {
    await this.schemaReady;

    const result = await this.pool.query<UserSummaryRow>(
      'SELECT id, email, rol FROM usuario ORDER BY email ASC',
    );

    return { users: result.rows };
  }

  async updateUser(
    id: string,
    payload: {
      email?: string;
      password?: string;
      rol?: 'Admin' | 'Operador' | 'Auditor';
    },
  ) {
    await this.schemaReady;

    const currentResult = await this.pool.query<UserSummaryRow>(
      'SELECT id, email, rol FROM usuario WHERE id = $1',
      [id],
    );

    const currentUser = currentResult.rows[0];
    if (!currentUser) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    if (payload.email) {
      const existing = await this.pool.query<{ id: string }>(
        'SELECT id FROM usuario WHERE lower(email) = lower($1) AND id <> $2',
        [payload.email, id],
      );

      if (existing.rowCount) {
        throw new BadRequestException('El correo ya esta registrado.');
      }
    }

    const updates: string[] = [];
    const values: Array<string> = [];

    if (payload.email) {
      values.push(payload.email.toLowerCase());
      updates.push(`email = $${values.length}`);
    }

    if (payload.password) {
      const passwordHash = await bcrypt.hash(payload.password, 10);
      values.push(passwordHash);
      updates.push(`password = $${values.length}`);
    }

    if (payload.rol) {
      values.push(payload.rol);
      updates.push(`rol = $${values.length}`);
    }

    if (!updates.length) {
      throw new BadRequestException(
        'Debes enviar al menos un campo para actualizar.',
      );
    }

    values.push(id);

    const result = await this.pool.query<UserSummaryRow>(
      `UPDATE usuario SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING id, email, rol`,
      values,
    );

    return { user: result.rows[0] };
  }

  async deleteUser(id: string, currentUserId?: string) {
    await this.schemaReady;

    if (currentUserId && currentUserId === id) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta.');
    }

    const result = await this.pool.query<UserSummaryRow>(
      'DELETE FROM usuario WHERE id = $1 RETURNING id, email, rol',
      [id],
    );

    if (!result.rowCount) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    return { user: result.rows[0] };
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token, {
      secret: process.env.JWT_SECRET ?? 'change-me',
    });
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

  private async ensureSchema() {
    await this.pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

    await this.pool.query(
      "DO $$ BEGIN CREATE TYPE rol_usuario AS ENUM ('Admin', 'Operador', 'Auditor'); EXCEPTION WHEN duplicate_object THEN null; END $$;",
    );

    await this.pool.query(
      'CREATE TABLE IF NOT EXISTS usuario (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email VARCHAR(150) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, rol rol_usuario NOT NULL);',
    );
  }
}
