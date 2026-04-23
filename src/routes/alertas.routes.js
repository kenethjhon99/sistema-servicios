import { Router } from "express";
import {
  generarAlertas,
  listarAlertas,
  marcarAlertaLeida,
  marcarTodasLeidas,
  eliminarAlerta,
  obtenerDashboardBase,
} from "../controllers/alertas.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";


const router = Router();

router.post("/generar", authRequired, generarAlertas);
router.get("/", authRequired, listarAlertas);
router.patch("/:id/leida", authRequired, marcarAlertaLeida);
router.patch("/marcar-todas/leidas", authRequired, marcarTodasLeidas);
router.delete("/:id", authRequired, eliminarAlerta);

router.get("/dashboard/base", authRequired, obtenerDashboardBase);

export default router;