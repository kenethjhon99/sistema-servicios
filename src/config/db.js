import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
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