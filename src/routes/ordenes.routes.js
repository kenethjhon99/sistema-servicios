import { Router } from "express";
import {
  crearOrdenTrabajo,
  listarOrdenesTrabajo,
  obtenerOrdenTrabajoPorId,
  actualizarOrdenTrabajo,
  cambiarEstadoOrdenTrabajo,
} from "../controllers/ordenes.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";
import { validateIdParam, parsePagination } from "../middlewares/validators.middleware.js";

const router = Router();

router.get("/", authRequired, parsePagination, listarOrdenesTrabajo);
router.get("/:id", authRequired, validateIdParam(), obtenerOrdenTrabajoPorId);
router.post("/", authRequired, requireRole("ADMIN", "SUPERVISOR", "OPERADOR"), crearOrdenTrabajo);
router.put("/:id", authRequired, requireRole("ADMIN", "SUPERVISOR", "OPERADOR"), validateIdParam(), actualizarOrdenTrabajo);
router.patch("/:id/estado", authRequired, requireRole("ADMIN", "SUPERVISOR"), validateIdParam(), cambiarEstadoOrdenTrabajo);

export default router;
