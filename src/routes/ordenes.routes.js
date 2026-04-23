import { Router } from "express";
import {
  crearOrdenTrabajo,
  listarOrdenesTrabajo,
  obtenerOrdenTrabajoPorId,
  actualizarOrdenTrabajo,
  cambiarEstadoOrdenTrabajo,
} from "../controllers/ordenes.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";


const router = Router();

router.post("/", authRequired, crearOrdenTrabajo);
router.get("/", authRequired, listarOrdenesTrabajo);
router.get("/:id", authRequired, obtenerOrdenTrabajoPorId);
router.put("/:id", authRequired, actualizarOrdenTrabajo);
router.patch("/:id/estado", authRequired, cambiarEstadoOrdenTrabajo);

export default router;
