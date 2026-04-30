import { Router } from "express";
import {
  actualizarEmpleado,
  cambiarEstadoEmpleado,
  crearEmpleado,
  listarEmpleados,
  obtenerEmpleadoPorId,
} from "../controllers/empleados.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";
import { parsePagination, validateIdParam } from "../middlewares/validators.middleware.js";

const router = Router();

router.get("/", authRequired, parsePagination, listarEmpleados);
router.get("/:id", authRequired, validateIdParam(), obtenerEmpleadoPorId);
router.post("/", authRequired, requireRole("ADMIN", "SUPERVISOR"), crearEmpleado);
router.put(
  "/:id",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  validateIdParam(),
  actualizarEmpleado
);
router.patch(
  "/:id/estado",
  authRequired,
  requireRole("ADMIN", "SUPERVISOR"),
  validateIdParam(),
  cambiarEstadoEmpleado
);

export default router;
