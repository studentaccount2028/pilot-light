// AI-assisted: written with Claude Code from the team's build spec.
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

// One pool per process, surviving Next.js hot reloads in dev.
const g = globalThis as unknown as { __plPool?: Pool; __plDb?: Db };

function init(): Db {
  if (!g.__plDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
    g.__plPool = new Pool({ connectionString: url, max: 10 });
    g.__plDb = drizzle(g.__plPool, { schema });
  }
  return g.__plDb;
}

// Lazy so that importing this module never needs the env var (build, tests).
export const db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = init() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export async function closeDb() {
  await g.__plPool?.end();
  g.__plPool = undefined;
  g.__plDb = undefined;
}

export { schema };
