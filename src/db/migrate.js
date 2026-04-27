/**
 * Runner de migraciones simple — sin dependencias externas.
 *
 * Convención:
 *   - Archivos en `backend/migrations/NNNN_descripcion.sql` (ordenados por nombre).
 *   - Cada archivo se aplica dentro de una transacción.
 *   - Se registra la versión aplicada en la tabla `schema_migrations`.
 *   - Sólo se aplican migraciones cuyo nombre no esté ya registrado.
 *
 * Comandos:
 *   node src/db/migrate.js up      → aplica migraciones pendientes (default)
 *   node src/db/migrate.js status  → muestra qué está aplicado y qué pendiente
 *
 * Uso típico:
 *   npm run db:migrate
 *   npm run db:status
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "migrations");

const ensureSchemaTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version       text PRIMARY KEY,
      applied_at    timestamptz NOT NULL DEFAULT now()
    );
  `);
};

const listMigrationFiles = async () => {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  return entries
    .filter((f) => f.endsWith(".sql"))
    .sort(); // orden lexicográfico estable: 0001_..., 0002_..., 0010_...
};

const listAppliedVersions = async () => {
  const { rows } = await pool.query(
    "SELECT version FROM schema_migrations ORDER BY version"
  );
  return new Set(rows.map((r) => r.version));
};

const applyMigration = async (filename) => {
  const fullPath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(fullPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ($1)",
      [filename]
    );
    await client.query("COMMIT");
    console.log(`  ✅ ${filename}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`  ❌ ${filename}`);
    throw err;
  } finally {
    client.release();
  }
};

const cmdUp = async () => {
  console.log("🔄 Migraciones — aplicando pendientes...\n");

  await ensureSchemaTable();
  const all = await listMigrationFiles();
  const applied = await listAppliedVersions();

  const pending = all.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("✨ No hay migraciones pendientes. Schema al día.");
    return;
  }

  console.log(`Aplicando ${pending.length} migración(es):\n`);
  for (const file of pending) {
    await applyMigration(file);
  }
  console.log(`\n✅ Listo. ${pending.length} migración(es) aplicada(s).`);
};

const cmdStatus = async () => {
  await ensureSchemaTable();
  const all = await listMigrationFiles();
  const applied = await listAppliedVersions();

  console.log("📋 Estado de migraciones:\n");
  if (all.length === 0) {
    console.log("  (no hay archivos en migrations/)");
    return;
  }

  for (const file of all) {
    const mark = applied.has(file) ? "✅ aplicada" : "⏳ pendiente";
    console.log(`  ${mark}  ${file}`);
  }

  const pending = all.filter((f) => !applied.has(f)).length;
  console.log(`\nTotal: ${all.length} · Pendientes: ${pending}`);
};

const main = async () => {
  const cmd = process.argv[2] || "up";

  try {
    if (cmd === "up") {
      await cmdUp();
    } else if (cmd === "status") {
      await cmdStatus();
    } else {
      console.error(`Comando desconocido: "${cmd}". Usa "up" o "status".`);
      process.exit(1);
    }
  } catch (err) {
    console.error("\n💥 Error en migración:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

main();
