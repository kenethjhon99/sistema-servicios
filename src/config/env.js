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

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 3000),

  PGHOST: process.env.PGHOST,
  PGPORT: Number(process.env.PGPORT),
  PGDATABASE: process.env.PGDATABASE,
  PGUSER: process.env.PGUSER,
  PGPASSWORD: process.env.PGPASSWORD,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "8h",

  CORS_ORIGINS: (process.env.CORS_ORIGINS || "*")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  RATE_LIMIT_LOGIN_MAX: Number(process.env.RATE_LIMIT_LOGIN_MAX || 10),
  RATE_LIMIT_LOGIN_WINDOW_MIN: Number(process.env.RATE_LIMIT_LOGIN_WINDOW_MIN || 15),
};
