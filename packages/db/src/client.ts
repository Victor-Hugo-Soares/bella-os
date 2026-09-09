import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface DbHandle {
  pool: pg.Pool;
  db: Db;
  close: () => Promise<void>;
}

/**
 * Cria pool + cliente Drizzle. Um por processo. `max` baixo porque o Postgres gerenciado
 * tem limite de conexões e o volume do restaurante é pequeno.
 */
export function createDb(connectionString: string, options: { max?: number } = {}): DbHandle {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { pool, db, close: () => pool.end() };
}
