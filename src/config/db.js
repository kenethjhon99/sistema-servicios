import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

export const pool = new Pool({
  host: env.PGHOST,
  port: env.PGPORT,
  database: env.PGDATABASE,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  // SSL para conexiones a BDs gestionadas (Supabase, Neon, RDS, etc).
  // rejectUnauthorized: false acepta certificados firmados por CAs no
  // listadas localmente — necesario para la mayoría de BaaS.
  ssl: env.PGSSL ? { rejectUnauthorized: false } : false,
});

pool.on("connect", () => {
  console.log("✅ PostgreSQL conectado");
});

// M8: Si el pool entra en estado roto en producción, mejor terminar el
// proceso para que el orquestador (PM2, Docker, systemd, Render) reinicie
// limpio en vez de servir 500s indefinidamente. En dev/test solo logeamos.
pool.on("error", (err) => {
  console.error("❌ Error inesperado en PostgreSQL:", err.message);
  if (env.NODE_ENV === "production") {
    console.error("   Terminando proceso para que el orquestador reinicie.");
    process.exit(1);
  }
});

export async function testDB() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("🟢 BD respondiendo:", result.rows[0]);
  } catch (error) {
    console.error("🔴 Error al conectar con PostgreSQL:", error.message);
  }
}
