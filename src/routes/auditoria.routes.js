import { Router } from "express";
import {
  listarAuditorias,
  obtenerAuditoriaPorId,
  obtenerHistorialRegistro,
  obtenerAuditoriaPorUsuario,
} from "../controllers/auditoria.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";
import { validateIdParam, parsePagination } from "../middlewares/validators.middleware.js";

const router = Router();

// Solo ADMIN y SUPERVISOR pueden consultar auditoría
router.get("/", authRequired, requireRole("ADMIN", "SUPERVISOR"), parsePagination, listarAuditorias);
router.get("/:id", authRequired, requireRole("ADMIN", "SUPERVISOR"), validateIdParam(), obtenerAuditoriaPorId);
router.get(
  "/registro/:tabla_afectada/:id_registro",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  validateIdParam("id_registro"),
  obtenerHistorialRegistro
);
router.get(
  "/usuario/:id_usuario",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  validateIdParam("id_usuario"),
  obtenerAuditoriaPorUsuario
);

export default router;
