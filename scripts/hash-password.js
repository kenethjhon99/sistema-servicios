/**
 * Utilidad CLI para generar un hash bcrypt de una contraseña.
 * Uso:
 *   node scripts/hash-password.js "mi_password"
 *
 * Útil para crear el primer usuario admin manualmente, sin pasar por la API.
 * La password no se valida contra la política — eso es responsabilidad del
 * caller (esto es solo un wrapper de bcrypt).
 */
import bcrypt from "bcrypt";

const password = process.argv[2];

if (!password) {
  console.error("Uso: node scripts/hash-password.js <password>");
  process.exit(1);
}

const ROUNDS = 12;
const hash = await bcrypt.hash(password, ROUNDS);
console.log(hash);
