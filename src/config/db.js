import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

export const pool = new Pool({
  ...(env.DATABASE_URL
    ? { connectionString: env.DATABASE_URL }
    : {
        host: env.PGHOST,
        port: env.PGPORT,
        database: env.PGDATABASE,
        user: env.PGUSER,
        password: env.PGPASSWORD,
      }),
  // SSL para conexiones a BDs gestionadas (Neon, RDS, Supabase, etc.).
  ssl: env.PGSSL ? { rejectUnauthorized: false } : false,
});

pool.on("connect", () => {
  console.log("PostgreSQL conectado");
});

pool.on("error", (err) => {
  console.error("Error inesperado en PostgreSQL:", err.message);
  if (env.NODE_ENV === "production") {
    console.error("Terminando proceso para que el orquestador reinicie.");
    process.exit(1);
  }
});

export async function testDB() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("BD respondiendo:", result.rows[0]);
  } catch (error) {
    console.error("Error al conectar con PostgreSQL:", error.message);
  }
}
