import { Router } from "express";
import {
  listarAuditorias,
  obtenerAuditoriaPorId,
  obtenerHistorialRegistro,
  obtenerAuditoriaPorUsuario,
} from "../controllers/auditoria.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

// Solo ADMIN y SUPERVISOR deberían consultar auditoría
router.get("/", authRequired, requireRole("ADMIN", "SUPERVISOR"), listarAuditorias);
router.get("/:id", authRequired, requireRole("ADMIN", "SUPERVISOR"), obtenerAuditoriaPorId);
router.get("/registro/:tabla_afectada/:id_registro", authRequired, requireRole("ADMIN", "SUPERVISOR"), obtenerHistorialRegistro);
router.get("/usuario/:id_usuario", authRequired, requireRole("ADMIN", "SUPERVISOR"), obtenerAuditoriaPorUsuario);

export default router;