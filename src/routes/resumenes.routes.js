import { Router } from "express";
import {
  obtenerResumenFinancieroOrden,
  obtenerPerfilCompletoCliente,
} from "../controllers/resumenes.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";


const router = Router();

router.get("/orden/:id_orden_trabajo",authRequired, obtenerResumenFinancieroOrden);
router.get("/cliente/:id_cliente",authRequired, obtenerPerfilCompletoCliente);

export default router;