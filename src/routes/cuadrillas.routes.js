import { Router } from "express";
import {
  actualizarCuadrilla,
  cambiarEstadoCuadrilla,
  crearCuadrilla,
  listarCuadrillas,
  obtenerCuadrillaPorId,
} from "../controllers/cuadrillas.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";
import { parsePagination, validateIdParam } from "../middlewares/validators.middleware.js";

const router = Router();

router.get("/", authRequired, parsePagination, listarCuadrillas);
router.get("/:id", authRequired, validateIdParam(), obtenerCuadrillaPorId);
router.post("/", authRequired, requireRole("ADMIN", "SUPERVISOR"), crearCuadrilla);
router.put(
  "/:id",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  validateIdParam(),
  actualizarCuadrilla
);
router.patch(
  "/:id/estado",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  validateIdParam(),
  cambiarEstadoCuadrilla
);

export default router;
