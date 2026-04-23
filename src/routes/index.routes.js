import { Router } from "express";
import authRoutes from "./auth.routes.js"
import usuariosRoutes from "./usuarios.routes.js"
import auditoriaRoutes from "./auditoria.routes.js"
import categoriasRoutes from "./categorias.routes.js";
import serviciosRoutes from "./servicios.routes.js";
import clientesRoutes from "./clientes.routes.js";
import propiedadesRoutes from "./propiedades.routes.js";
import programacionesRoutes from "./programaciones.routes.js";
import ordenesRoutes from "./ordenes.routes.js"
import evidenciasRoutes from "./evidencias.routes.js"
import pagosRoutes from "./pagos.routes.js"
import alertasRoutes from "./alertas.routes.js"
import resumenesRoutes from "./resumenes.routes.js"
import agendaRoutes from "./agenda.routes.js"


const router = Router();

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    message: "API saludable",
  });
});

router.use("/api/auth", authRoutes)
router.use("/api/usuarios",usuariosRoutes)
router.use("/api/categorias-servicio", categoriasRoutes);
router.use("/api/servicios", serviciosRoutes);
router.use("/api/clientes", clientesRoutes);
router.use("/api/propiedades", propiedadesRoutes);
router.use("/api/programaciones", programacionesRoutes);
router.use("/api/evidencias", evidenciasRoutes);
router.use("/api/pagos", pagosRoutes)
router.use("/api/alertas", alertasRoutes)
router.use("/api/resumenes", resumenesRoutes)
router.use("/api/agenda", agendaRoutes)
router.use("/api/auditoria", auditoriaRoutes)

export default router;