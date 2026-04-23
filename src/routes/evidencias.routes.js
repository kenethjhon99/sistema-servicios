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


const router = Router();

router.post("/", authRequired, crearEvidencia);
router.post("/lote", authRequired, crearMultiplesEvidencias);
router.get("/orden/:id_orden_trabajo", authRequired, listarEvidenciasPorOrden);
router.get("/:id", authRequired, obtenerEvidenciaPorId);
router.put("/:id", authRequired, actualizarEvidencia);
router.delete("/:id", authRequired, eliminarEvidencia);

export default router;