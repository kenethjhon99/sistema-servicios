import { Router } from "express";
import {
  crearProgramacion,
  listarProgramaciones,
  obtenerProgramacionPorId,
  actualizarProgramacion,
  cambiarEstadoProgramacion,
} from "../controllers/programaciones.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";


const router = Router();

router.post("/",authRequired, crearProgramacion);
router.get("/",authRequired, listarProgramaciones);
router.get("/:id",authRequired, obtenerProgramacionPorId);
router.put("/:id",authRequired, actualizarProgramacion);
router.patch("/:id/estado",authRequired, cambiarEstadoProgramacion);

export default router;