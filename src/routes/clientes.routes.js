import { Router } from "express";
import {
  crearCliente,
  listarClientes,
  obtenerClientePorId,
  actualizarCliente,
  cambiarEstadoCliente,
} from "../controllers/clientes.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";


const router = Router();

router.post("/", authRequired, crearCliente);
router.get("/", authRequired, listarClientes);
router.get("/:id", authRequired, obtenerClientePorId);
router.put("/:id", authRequired, actualizarCliente);
router.patch("/:id/estado", authRequired, cambiarEstadoCliente);

export default router;