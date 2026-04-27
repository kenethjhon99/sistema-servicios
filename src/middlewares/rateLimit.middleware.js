import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

// Limitador específico para login: previene brute force
export const loginRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_LOGIN_WINDOW_MIN * 60 * 1000,
  max: env.RATE_LIMIT_LOGIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiados intentos de login. Intenta de nuevo en unos minutos.",
  },
});

// Limitador general para rutas de autenticación (perfil, refresh, etc.)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Demasiadas peticiones al módulo de autenticación.",
  },
});

/**
 * Limitador general para toda la API.
 * Pensado como red de seguridad contra abuso (no como anti-DDoS — eso requiere
 * infra externa). Defaults conservadores: 600 requests / 15 min por IP.
 *
 * Se desactiva en NODE_ENV === "test" para no romper la suite.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: {
    error: "Demasiadas peticiones. Intenta de nuevo en unos minutos.",
  },
});
