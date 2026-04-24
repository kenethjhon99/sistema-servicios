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
