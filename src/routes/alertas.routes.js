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
import { validateIdParam, parsePagination } from "../middlewares/validators.middleware.js";

const router = Router();

router.get("/", authRequired, parsePagination, listarAlertas);
router.post("/generar", authRequired, requireRole("ADMIN", "SUPERVISOR"), generarAlertas);
router.patch("/:id/leida", authRequired, validateIdParam(), marcarAlertaLeida);
router.patch("/marcar-todas/leidas", authRequired, marcarTodasLeidas);
router.delete("/:id", authRequired, requireRole("ADMIN", "SUPERVISOR"), validateIdParam(), eliminarAlerta);

router.get("/dashboard/base", authRequired, obtenerDashboardBase);

export default router;
