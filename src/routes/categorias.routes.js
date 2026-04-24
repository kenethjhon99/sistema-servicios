import { Router } from "express";
import {
  crearCategoria,
  listarCategorias,
  obtenerCategoriaPorId,
  actualizarCategoria,
  cambiarEstadoCategoria,
} from "../controllers/categorias.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";
import { validateIdParam } from "../middlewares/validators.middleware.js";

const router = Router();

router.get("/", authRequired, listarCategorias);
router.get("/:id", authRequired, validateIdParam(), obtenerCategoriaPorId);
router.post("/", authRequired, requireRole("ADMIN"), crearCategoria);
router.put("/:id", authRequired, requireRole("ADMIN"), validateIdParam(), actualizarCategoria);
router.patch("/:id/estado", authRequired, requireRole("ADMIN"), validateIdParam(), cambiarEstadoCategoria);

export default router;
