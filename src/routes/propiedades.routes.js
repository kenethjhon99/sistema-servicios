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
import { validateIdParam, parsePagination } from "../middlewares/validators.middleware.js";

const router = Router();

router.get("/", authRequired, parsePagination, listarPropiedades);
router.get("/cliente/:id_cliente", authRequired, validateIdParam("id_cliente"), listarPropiedadesPorCliente);
router.get("/:id", authRequired, validateIdParam(), obtenerPropiedadPorId);
router.post("/", authRequired, requireRole("ADMIN", "SUPERVISOR"), crearPropiedad);
router.put("/:id", authRequired, requireRole("ADMIN", "SUPERVISOR"), validateIdParam(), actualizarPropiedad);
router.patch("/:id/estado", authRequired, requireRole("ADMIN", "SUPERVISOR"), validateIdParam(), cambiarEstadoPropiedad);

export default router;
