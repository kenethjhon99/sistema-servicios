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
import { validateIdParam, parsePagination } from "../middlewares/validators.middleware.js";

const router = Router();

// Gestión de usuarios (solo ADMIN)
router.get("/", authRequired, requireRole("ADMIN"), parsePagination, listarUsuarios);
router.get("/:id", authRequired, requireRole("ADMIN"), validateIdParam(), obtenerUsuarioPorId);
router.post("/", authRequired, requireRole("ADMIN"), crearUsuario);
router.put("/:id", authRequired, requireRole("ADMIN"), validateIdParam(), actualizarUsuario);
router.patch("/:id/estado", authRequired, requireRole("ADMIN"), validateIdParam(), cambiarEstadoUsuario);

// Seguridad
router.patch("/mi/password", authRequired, cambiarMiPassword);
router.patch("/:id/reset-password", authRequired, requireRole("ADMIN"), validateIdParam(), resetearPasswordUsuario);

export default router;
