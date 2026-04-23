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


const router = Router();

router.post("/", authRequired, crearPago);
router.get("/", authRequired, listarPagos);
router.get("/:id", authRequired, obtenerPagoPorId);

router.post("/creditos", authRequired, crearCredito);
router.get("/creditos/lista", authRequired, listarCreditos);
router.get("/creditos/:id", authRequired, obtenerCreditoPorId);
router.patch("/creditos/:id/estado",authRequired, cambiarEstadoCredito);

router.post("/creditos/aplicar-pago",authRequired, aplicarPagoACredito);

export default router;