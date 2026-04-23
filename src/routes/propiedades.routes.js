import { Router } from "express";
import {
  crearPropiedad,
  listarPropiedades,
  listarPropiedadesPorCliente,
  obtenerPropiedadPorId,
  actualizarPropiedad,
  cambiarEstadoPropiedad,
} from "../controllers/propiedades.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";


const router = Router();

router.post("/",authRequired, crearPropiedad);
router.get("/",authRequired, listarPropiedades);
router.get("/cliente/:id_cliente",authRequired, listarPropiedadesPorCliente);
router.get("/:id",authRequired, obtenerPropiedadPorId);
router.put("/:id",authRequired, actualizarPropiedad);
router.patch("/:id/estado",authRequired, cambiarEstadoPropiedad);

export default router;