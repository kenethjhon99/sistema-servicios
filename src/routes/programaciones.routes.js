import { Router } from "express";
import {
  crearProgramacion,
  listarProgramaciones,
  obtenerProgramacionPorId,
  actualizarProgramacion,
  cambiarEstadoProgramacion,
  listarEjecucionesProgramacion,
  generarEjecucionProgramacion,
  reprogramarEjecucionProgramacion,
  cancelarEjecucionProgramacion,
  generarOrdenDesdeEjecucionProgramacion,
} from "../controllers/programaciones.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";
import { validateIdParam, parsePagination } from "../middlewares/validators.middleware.js";

const router = Router();

router.get("/", authRequired, parsePagination, listarProgramaciones);
router.get("/:id", authRequired, validateIdParam(), obtenerProgramacionPorId);
router.get("/:id/ejecuciones", authRequired, validateIdParam(), listarEjecucionesProgramacion);
router.post("/", authRequired, requireRole("ADMIN", "SUPERVISOR"), crearProgramacion);
router.post(
  "/:id/ejecuciones/generar",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  validateIdParam(),
  generarEjecucionProgramacion
);
router.put("/:id", authRequired, requireRole("ADMIN", "SUPERVISOR"), validateIdParam(), actualizarProgramacion);
router.patch("/:id/estado", authRequired, requireRole("ADMIN", "SUPERVISOR"), validateIdParam(), cambiarEstadoProgramacion);
router.post(
  "/ejecuciones/:id/reprogramar",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  validateIdParam(),
  reprogramarEjecucionProgramacion
);
router.post(
  "/ejecuciones/:id/cancelar",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  validateIdParam(),
  cancelarEjecucionProgramacion
);
router.post(
  "/ejecuciones/:id/generar-orden",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  validateIdParam(),
  generarOrdenDesdeEjecucionProgramacion
);

export default router;
