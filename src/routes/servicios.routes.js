import { Router } from "express";
import {
  crearServicio,
  listarServicios,
  obtenerServicioPorId,
  actualizarServicio,
  cambiarEstadoServicio,
} from "../controllers/servicios.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";
import { validateIdParam, parsePagination } from "../middlewares/validators.middleware.js";

const router = Router();

router.get("/", authRequired, parsePagination, listarServicios);
router.get("/:id", authRequired, validateIdParam(), obtenerServicioPorId);
router.post("/", authRequired, requireRole("ADMIN"), crearServicio);
router.put("/:id", authRequired, requireRole("ADMIN"), validateIdParam(), actualizarServicio);
router.patch("/:id/estado", authRequired, requireRole("ADMIN"), validateIdParam(), cambiarEstadoServicio);

export default router;
