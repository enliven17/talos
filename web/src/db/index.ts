import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import * as relations from "./relations";

const globalForDb = globalThis as unknown as { pool: Pool };

function poolOptions(): ConstructorParameters<typeof Pool>[0] {
  let connectionString = process.env.DATABASE_URL!;
  const supabase = /supabase\.(co|com)/i.test(connectionString);
  if (supabase) {
    // Avoid sslmode= in URL fighting pg's ssl option (Windows / pooler chain issues).
    connectionString = connectionString
      .replace(/[?&]sslmode=[^&]*/g, "")
      .replace(/\?$/, "");
  }
  return {
    connectionString,
    ...(supabase ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

const pool = globalForDb.pool || new Pool(poolOptions());

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema: { ...schema, ...relations } });
