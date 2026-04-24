import { Router } from "express";
import {
  loginUsuario,
  perfilUsuario,
} from "../controllers/auth.controller.js";
import { authRequired } from "../middlewares/auth.middleware.js";
import { loginRateLimiter } from "../middlewares/rateLimit.middleware.js";

const router = Router();

// Autenticación
router.post("/login", loginRateLimiter, loginUsuario);
router.get("/perfil", authRequired, perfilUsuario);

// Para crear usuarios usar POST /usuarios (requiere ADMIN).

export default router;
