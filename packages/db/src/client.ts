import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";

// Admin connection — used only by migration scripts and role setup
export function createAdminDb(url?: string) {
  const pool = new Pool({ connectionString: url ?? process.env["DATABASE_ADMIN_URL"] });
  return drizzle(pool, { schema });
}

// Application connection — restricted role (SELECT + INSERT on ledger)
export function createAppDb(url?: string) {
  const pool = new Pool({ connectionString: url ?? process.env["DATABASE_URL"] });
  return drizzle(pool, { schema });
}

export type AdminDb = ReturnType<typeof createAdminDb>;
export type AppDb = ReturnType<typeof createAppDb>;

export * from "./schema/index.js";
