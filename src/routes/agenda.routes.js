import { Router } from "express";
import {
  obtenerAgendaDia,
  obtenerAgendaRango,
  obtenerCalendarioMensual,
  obtenerVencimientosCredito,
} from "../controllers/agenda.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";


const router = Router();

router.get("/dia", authRequired, obtenerAgendaDia);
router.get("/rango", authRequired, obtenerAgendaRango);
router.get("/mensual", authRequired, obtenerCalendarioMensual);
router.get("/creditos/vencimientos",authRequired,  obtenerVencimientosCredito);

export default router;