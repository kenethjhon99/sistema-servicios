import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { apiRateLimiter } from "./middlewares/rateLimit.middleware.js";
import indexRoutes from "./routes/index.routes.js";

const app = express();

if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet());

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const originMatches = (origin, rule) => {
  if (rule === "*") return true;
  if (!rule.includes("*")) return origin === rule;
  const regex = new RegExp(`^${rule.split("*").map(escapeRegex).join(".*")}$`);
  return regex.test(origin);
};

const corsOptions =
  env.CORS_ORIGINS.length === 1 && env.CORS_ORIGINS[0] === "*"
    ? {}
    : {
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (env.CORS_ORIGINS.some((rule) => originMatches(origin, rule))) {
            return callback(null, true);
          }
          return callback(new Error(`Origen no permitido por CORS: ${origin}`));
        },
        credentials: true,
      };

app.use(cors(corsOptions));

if (env.NODE_ENV !== "test") {
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
}

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    message: "Backend funcionando correctamente",
    env: env.NODE_ENV,
  });
});

app.get("/healthz", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "backend",
    env: env.NODE_ENV,
  });
});

app.use("/api", apiRateLimiter);
app.use("/api", indexRoutes);

app.use((req, res) => {
  return res.status(404).json({
    error: "Recurso no encontrado",
    ruta: req.originalUrl,
  });
});

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
