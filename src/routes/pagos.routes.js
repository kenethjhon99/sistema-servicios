import { Router } from "express";
import {
  crearPago,
  listarPagos,
  obtenerPagoPorId,
  crearCredito,
  listarCreditos,
  obtenerCreditoPorId,
  cambiarEstadoCredito,
  aplicarPagoACredito,
} from "../controllers/pagos.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";
import { validateIdParam, parsePagination } from "../middlewares/validators.middleware.js";

const router = Router();

// Pagos
router.get("/", authRequired, parsePagination, listarPagos);
router.get("/:id", authRequired, validateIdParam(), obtenerPagoPorId);
router.post("/", authRequired, requireRole("ADMIN", "SUPERVISOR", "COBRADOR"), crearPago);

// Créditos
router.get("/creditos/lista", authRequired, parsePagination, listarCreditos);
router.get("/creditos/:id", authRequired, validateIdParam(), obtenerCreditoPorId);
router.post("/creditos", authRequired, requireRole("ADMIN", "SUPERVISOR"), crearCredito);
router.patch("/creditos/:id/estado", authRequired, requireRole("ADMIN"), validateIdParam(), cambiarEstadoCredito);
router.post("/creditos/aplicar-pago", authRequired, requireRole("ADMIN", "SUPERVISOR", "COBRADOR"), aplicarPagoACredito);

export default router;
