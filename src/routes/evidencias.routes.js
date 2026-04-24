import { Router } from "express";
import {
  crearEvidencia,
  crearMultiplesEvidencias,
  listarEvidenciasPorOrden,
  obtenerEvidenciaPorId,
  actualizarEvidencia,
  eliminarEvidencia,
} from "../controllers/evidencias.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";
import { validateIdParam } from "../middlewares/validators.middleware.js";

const router = Router();

router.get("/orden/:id_orden_trabajo", authRequired, validateIdParam("id_orden_trabajo"), listarEvidenciasPorOrden);
router.get("/:id", authRequired, validateIdParam(), obtenerEvidenciaPorId);
router.post("/", authRequired, crearEvidencia);
router.post("/lote", authRequired, crearMultiplesEvidencias);
router.put("/:id", authRequired, validateIdParam(), actualizarEvidencia);
router.delete("/:id", authRequired, requireRole("ADMIN", "SUPERVISOR"), validateIdParam(), eliminarEvidencia);

export default router;
