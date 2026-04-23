import { Router } from "express";
import {
  registrarUsuario,
  loginUsuario,
  perfilUsuario,
} from "../controllers/auth.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

// Solo ADMIN debería crear usuarios en producción
router.post("/register", authRequired, requireRole("ADMIN"), registrarUsuario);

// Si todavía no tienes ningún usuario, temporalmente puedes quitar authRequired y requireRole
// router.post("/register", registrarUsuario);

router.post("/login", loginUsuario);
router.get("/perfil", authRequired, perfilUsuario);

export default router;