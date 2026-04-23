import { Router } from "express";
import {
  crearServicio,
  listarServicios,
  obtenerServicioPorId,
  actualizarServicio,
  cambiarEstadoServicio,
} from "../controllers/servicios.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";


const router = Router();

router.post("/",authRequired, crearServicio);
router.get("/",authRequired, listarServicios);
router.get("/:id",authRequired, obtenerServicioPorId);
router.put("/:id",authRequired, actualizarServicio);
router.patch("/:id/estado",authRequired, cambiarEstadoServicio);

export default router;