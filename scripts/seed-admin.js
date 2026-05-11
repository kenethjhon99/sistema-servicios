/**
 * Crea el primer usuario ADMIN sin pasar por la API.
 *
 * Uso:
 *   npm run seed:admin -- <username> <password> [nombre] [correo]
 *
 * Ejemplo:
 *   npm run seed:admin -- admin Admin1234 "Administrador" admin@empresa.com
 */
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import pg from "pg";
import { BCRYPT_ROUNDS, validarPassword } from "../src/utils/password.js";

dotenv.config();

const [, , usernameArg, passwordArg, nombreArg, correoArg] = process.argv;

if (!usernameArg || !passwordArg) {
  console.error(
    "Uso: npm run seed:admin -- <username> <password> [nombre] [correo]"
  );
  process.exit(1);
}

const passwordCheck = validarPassword(passwordArg);
if (!passwordCheck.valid) {
  console.error(`❌ ${passwordCheck.error}`);
  process.exit(1);
}

const buildPoolConfig = () => {
  const baseSsl =
    process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false;

  if (process.env.DATABASE_URL?.trim()) {
    return {
      connectionString: process.env.DATABASE_URL.trim(),
      ssl: baseSsl,
    };
  }

  return {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: baseSsl,
  };
};

const pool = new pg.Pool(buildPoolConfig());

const main = async () => {
  const username = usernameArg.trim();
  const password = passwordArg;
  const nombre = (nombreArg || "Administrador").trim();
  const correo = correoArg?.trim() || null;

  try {
    const existe = await pool.query(
      `
        SELECT id_usuario
        FROM usuarios
        WHERE username = $1
           OR ($2::text IS NOT NULL AND correo = $2)
      `,
      [username, correo]
    );

    if (existe.rows.length > 0) {
      console.error("❌ Ya existe un usuario con ese username o correo.");
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { rows } = await pool.query(
      `
        INSERT INTO usuarios (
          nombre,
          correo,
          telefono,
          username,
          password_hash,
          rol,
          estado
        )
        VALUES ($1, $2, NULL, $3, $4, 'ADMIN', 'ACTIVO')
        RETURNING id_usuario, nombre, correo, username, rol, estado
      `,
      [nombre, correo, username, passwordHash]
    );

    console.log("✅ Usuario administrador creado correctamente:");
    console.log(rows[0]);
  } catch (error) {
    console.error("❌ Error al crear el admin inicial:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

main();
