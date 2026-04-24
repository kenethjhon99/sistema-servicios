import { Router } from "express";
import authRoutes from "./auth.routes.js";
import usuariosRoutes from "./usuarios.routes.js";
import auditoriaRoutes from "./auditoria.routes.js";
import categoriasRoutes from "./categorias.routes.js";
import serviciosRoutes from "./servicios.routes.js";
import clientesRoutes from "./clientes.routes.js";
import propiedadesRoutes from "./propiedades.routes.js";
import programacionesRoutes from "./programaciones.routes.js";
import ordenesRoutes from "./ordenes.routes.js";
import evidenciasRoutes from "./evidencias.routes.js";
import pagosRoutes from "./pagos.routes.js";
import alertasRoutes from "./alertas.routes.js";
import resumenesRoutes from "./resumenes.routes.js";
import agendaRoutes from "./agenda.routes.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    message: "API saludable",
  });
});

router.use("/auth", authRoutes);
router.use("/usuarios", usuariosRoutes);
router.use("/categorias-servicio", categoriasRoutes);
router.use("/servicios", serviciosRoutes);
router.use("/clientes", clientesRoutes);
router.use("/propiedades", propiedadesRoutes);
router.use("/programaciones", programacionesRoutes);
router.use("/ordenes", ordenesRoutes);
router.use("/evidencias", evidenciasRoutes);
router.use("/pagos", pagosRoutes);
router.use("/alertas", alertasRoutes);
router.use("/resumenes", resumenesRoutes);
router.use("/agenda", agendaRoutes);
router.use("/auditoria", auditoriaRoutes);

export default router;
