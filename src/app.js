import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { apiRateLimiter } from "./middlewares/rateLimit.middleware.js";
import indexRoutes from "./routes/index.routes.js";

const app = express();

// Trust proxy en producción: cuando el backend va detrás de un reverse
// proxy (nginx, Cloudflare, Render, Heroku), `req.ip` debe leerse del
// header X-Forwarded-For. Sin esto, el rate limiter cuenta TODAS las
// peticiones bajo la IP del proxy y un atacante puede agotar el cupo
// para todos los demás usuarios.
if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Seguridad
app.use(helmet());

// CORS — si CORS_ORIGINS="*" permite todo, si no, whitelist
const corsOptions =
  env.CORS_ORIGINS.length === 1 && env.CORS_ORIGINS[0] === "*"
    ? {}
    : {
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);
          return callback(new Error(`Origen no permitido por CORS: ${origin}`));
        },
        credentials: true,
      };

app.use(cors(corsOptions));

// Logging HTTP
if (env.NODE_ENV !== "test") {
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
}

// Body parsers — límite conservador. Los endpoints actuales son sólo JSON
// con payloads pequeños. Subirlo selectivamente en uploads cuando se
// implementen (multer + storage externo).
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// Health
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Backend funcionando correctamente",
    env: env.NODE_ENV,
  });
});

// Rate limit general (red de seguridad sobre toda la API).
// El loginRateLimiter más estricto se aplica DENTRO de auth.routes.
app.use("/api", apiRateLimiter);

// API
app.use("/api", indexRoutes);

// 404
app.use((req, res) => {
  return res.status(404).json({
    error: "Recurso no encontrado",
    ruta: req.originalUrl,
  });
});

// Error handler global
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error("Error no manejado:", err);

  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON inválido en el cuerpo de la petición" });
  }

  if (err && err.message && err.message.startsWith("Origen no permitido por CORS")) {
    return res.status(403).json({ error: err.message });
  }

  return res.status(500).json({
    error: "Error interno del servidor",
  });
});

export default app;
