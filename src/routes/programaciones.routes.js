import { Router } from "express";
import {
  crearProgramacion,
  listarProgramaciones,
  obtenerProgramacionPorId,
  actualizarProgramacion,
  cambiarEstadoProgramacion,
} from "../controllers/programaciones.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";
import { validateIdParam, parsePagination } from "../middlewares/validators.middleware.js";

const router = Router();

router.get("/", authRequired, parsePagination, listarProgramaciones);
router.get("/:id", authRequired, validateIdParam(), obtenerProgramacionPorId);
router.post("/", authRequired, requireRole("ADMIN", "SUPERVISOR"), crearProgramacion);
router.put("/:id", authRequired, requireRole("ADMIN", "SUPERVISOR"), validateIdParam(), actualizarProgramacion);
router.patch("/:id/estado", authRequired, requireRole("ADMIN", "SUPERVISOR"), validateIdParam(), cambiarEstadoProgramacion);

export default router;
