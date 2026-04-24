import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

export const pool = new Pool({
  host: env.PGHOST,
  port: env.PGPORT,
  database: env.PGDATABASE,
  user: env.PGUSER,
  password: env.PGPASSWORD,
});

pool.on("connect", () => {
  console.log("✅ PostgreSQL conectado");
});

pool.on("error", (err) => {
  console.error("❌ Error inesperado en PostgreSQL:", err.message);
});

export async function testDB() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("🟢 BD respondiendo:", result.rows[0]);
  } catch (error) {
    console.error("🔴 Error al conectar con PostgreSQL:", error.message);
  }
}
