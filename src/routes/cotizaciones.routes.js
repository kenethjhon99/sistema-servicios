import { Router } from "express";
import {
  crearCotizacion,
  listarCotizaciones,
  obtenerCotizacionPorId,
  actualizarCotizacion,
  cambiarEstadoCotizacion,
  convertirCotizacionAOrden,
} from "../controllers/cotizaciones.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";
import {
  validateIdParam,
  parsePagination,
} from "../middlewares/validators.middleware.js";

const router = Router();

router.get("/", authRequired, parsePagination, listarCotizaciones);
router.get("/:id", authRequired, validateIdParam(), obtenerCotizacionPorId);

router.post(
  "/",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  crearCotizacion
);

router.put(
  "/:id",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  validateIdParam(),
  actualizarCotizacion
);

router.patch(
  "/:id/estado",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  validateIdParam(),
  cambiarEstadoCotizacion
);

router.post(
  "/:id/convertir",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  validateIdParam(),
  convertirCotizacionAOrden
);

export default router;
