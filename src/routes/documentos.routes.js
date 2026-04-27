import { Router } from "express";
import {
  documentoReciboPago,
  documentoTicketServicio,
  documentoInformeOrden,
  documentoEstadoCuenta,
  documentoReciboAbono,
} from "../controllers/documentos.controller.js";
import { authRequired } from "../middlewares/auth.middleware.js";
import { validateIdParam } from "../middlewares/validators.middleware.js";

const router = Router();

// Recibo de pago suelto
router.get(
  "/recibo-pago/:id_pago",
  authRequired,
  validateIdParam("id_pago"),
  documentoReciboPago
);

// Ticket de servicio — versión corta para entregar al cliente al cerrar visita
router.get(
  "/ticket-servicio/:id_orden_trabajo",
  authRequired,
  validateIdParam("id_orden_trabajo"),
  documentoTicketServicio
);

// Informe completo de orden con evidencias
router.get(
  "/informe-orden/:id_orden_trabajo",
  authRequired,
  validateIdParam("id_orden_trabajo"),
  documentoInformeOrden
);

// Estado de cuenta del cliente con rango ?desde=&hasta=
router.get(
  "/estado-cuenta/:id_cliente",
  authRequired,
  validateIdParam("id_cliente"),
  documentoEstadoCuenta
);

// Recibo del abono aplicado a un crédito específico (id de pagos_credito)
router.get(
  "/recibo-abono/:id_pago_credito",
  authRequired,
  validateIdParam("id_pago_credito"),
  documentoReciboAbono
);

export default router;
