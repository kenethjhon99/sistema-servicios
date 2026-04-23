import { Router } from "express";
import {
  listarUsuarios,
  obtenerUsuarioPorId,
  crearUsuario,
  actualizarUsuario,
  cambiarEstadoUsuario,
  cambiarMiPassword,
  resetearPasswordUsuario,
} from "../controllers/usuarios.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

// Gestión de usuarios
router.get("/", authRequired, requireRole("ADMIN"), listarUsuarios);
router.get("/:id", authRequired, requireRole("ADMIN"), obtenerUsuarioPorId);
router.post("/", authRequired, requireRole("ADMIN"), crearUsuario);
router.put("/:id", authRequired, requireRole("ADMIN"), actualizarUsuario);
router.patch("/:id/estado", authRequired, requireRole("ADMIN"), cambiarEstadoUsuario);

// Seguridad
router.patch("/mi/password", authRequired, cambiarMiPassword);
router.patch("/:id/reset-password", authRequired, requireRole("ADMIN"), resetearPasswordUsuario);

export default router;