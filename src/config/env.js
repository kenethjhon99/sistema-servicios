import dotenv from "dotenv";

dotenv.config();

const REQUIRED_VARS = [
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "JWT_SECRET",
];

const missing = REQUIRED_VARS.filter((key) => {
  const value = process.env[key];
  return value === undefined || value === null || String(value).trim() === "";
});

if (missing.length > 0) {
  console.error(
    `❌ Variables de entorno faltantes: ${missing.join(", ")}`
  );
  console.error("Revisa tu archivo .env antes de iniciar el servidor.");
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 16) {
  console.error(
    "❌ JWT_SECRET es demasiado corto. Usa al menos 16 caracteres."
  );
  process.exit(1);
}

// Bloquea placeholders comunes — evita que un .env mal copiado arranque
// silenciosamente con un secreto que cualquiera puede adivinar.
const WEAK_SECRET_FRAGMENTS = [
  "cambiame",
  "cambia_esto",
  "tu_clave",
  "tu_calve",
  "tu_secreto",
  "change_me",
  "secret_key",
  "your_secret",
  "default_secret",
  "placeholder",
];
const secretLower = process.env.JWT_SECRET.toLowerCase();
const weakHit = WEAK_SECRET_FRAGMENTS.find((frag) => secretLower.includes(frag));
if (weakHit) {
  console.error(
    `❌ JWT_SECRET parece un placeholder ("${weakHit}"). Generá uno aleatorio:`
  );
  console.error(
    `   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
  );
  process.exit(1);
}

// CORS_ORIGINS obligatorio en producción — un default "*" abierto sería
// equivalente a deshabilitar CORS para clientes con credenciales.
if (process.env.NODE_ENV === "production" && !process.env.CORS_ORIGINS) {
  console.error(
    "❌ CORS_ORIGINS es obligatorio en producción. Lista los orígenes permitidos separados por coma."
  );
  process.exit(1);
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 3000),

  PGHOST: process.env.PGHOST,
  PGPORT: Number(process.env.PGPORT),
  PGDATABASE: process.env.PGDATABASE,
  PGUSER: process.env.PGUSER,
  PGPASSWORD: process.env.PGPASSWORD,
  PGSSL: process.env.PGSSL === "true",

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "8h",

  CORS_ORIGINS: (process.env.CORS_ORIGINS || "*")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  RATE_LIMIT_LOGIN_MAX: Number(process.env.RATE_LIMIT_LOGIN_MAX || 10),
  RATE_LIMIT_LOGIN_WINDOW_MIN: Number(process.env.RATE_LIMIT_LOGIN_WINDOW_MIN || 15),
};
