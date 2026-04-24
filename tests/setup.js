/**
 * Setup global para la suite de tests.
 * Se ejecuta ANTES de importar cualquier módulo de src/.
 *
 * Fija variables de entorno para que `src/config/env.js` no aborte
 * por vars faltantes y para que el código de prod no altere estado real.
 */
process.env.NODE_ENV = "test";
process.env.PORT = "0"; // no se usa, app no hace listen en tests

// Postgres — no se usará una conexión real, el pool se mockea
process.env.PGHOST = "localhost";
process.env.PGPORT = "5432";
process.env.PGDATABASE = "test_db";
process.env.PGUSER = "test_user";
process.env.PGPASSWORD = "test_password";

// JWT — al menos 16 chars (política de env.js)
process.env.JWT_SECRET = "test_jwt_secret_para_suite_de_pruebas_0123456789";
process.env.JWT_EXPIRES_IN = "1h";

// CORS abierto para tests
process.env.CORS_ORIGINS = "*";

// Rate limit amplio para no bloquear tests
process.env.RATE_LIMIT_LOGIN_MAX = "1000";
process.env.RATE_LIMIT_LOGIN_WINDOW_MIN = "15";
