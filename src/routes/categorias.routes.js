import { Router } from "express";
import {
  crearCategoria,
  listarCategorias,
  obtenerCategoriaPorId,
  actualizarCategoria,
  cambiarEstadoCategoria,
} from "../controllers/categorias.controller.js";
import { authRequired, requireRole } from "../middlewares/auth.middleware.js";


const router = Router();

router.post("/", authRequired, crearCategoria);
router.get("/", authRequired, listarCategorias);
router.get("/:id", authRequired, obtenerCategoriaPorId);
router.put("/:id", authRequired, actualizarCategoria);
router.patch("/:id/estado", authRequired, cambiarEstadoCategoria);

export default router;