import { Router } from "express";
import {
  crearCliente,
  listarClientes,
  obtenerClientePorId,
  actualizarCliente,
  cambiarEstadoCliente,
} from "../controllers/clientes.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";
import { validateIdParam, parsePagination } from "../middlewares/validators.middleware.js";

const router = Router();

router.get("/", authRequired, parsePagination, listarClientes);
router.get("/:id", authRequired, validateIdParam(), obtenerClientePorId);
router.post("/", authRequired, requireRole("ADMIN", "SUPERVISOR"), crearCliente);
router.put("/:id", authRequired, requireRole("ADMIN", "SUPERVISOR"), validateIdParam(), actualizarCliente);
router.patch("/:id/estado", authRequired, requireRole("ADMIN", "SUPERVISOR"), validateIdParam(), cambiarEstadoCliente);

export default router;
