/**
 * Endpoints de generación de documentos PDF (recibos, tickets, informes,
 * estados de cuenta, cotizaciones).
 *
 * Patrón común a todos:
 *   1. Validar permisos via authRequired (en routes).
 *   2. Cargar el recurso + cliente desde BD.
 *   3. Resolver idioma (?lang override > cliente.idioma_preferido > 'es').
 *   4. Pipe del PDF directamente a res — sin escribir a disco.
 *
 * Cabeceras de respuesta:
 *   Content-Type: application/pdf
 *   Content-Disposition: inline; filename="..."  (abre en pestaña nueva)
 */
import { pool } from "../config/db.js";
import { resolverIdioma } from "../utils/idioma.js";
import { hasPublicColumn } from "../utils/schema.js";
import { generarReciboPagoPDF } from "../services/pdf/reciboPago.js";
import { generarTicketServicioPDF } from "../services/pdf/ticketServicio.js";
import { generarInformeOrdenPDF } from "../services/pdf/informeOrden.js";
import { generarEstadoCuentaPDF } from "../services/pdf/estadoCuenta.js";
import { generarReciboAbonoPDF } from "../services/pdf/reciboAbono.js";
import { generarCotizacionPDF } from "../services/pdf/cotizacion.js";

/**
 * Helper: setea los headers HTTP de PDF inline con un filename dado.
 */
const setHeadersPDF = (res, filename) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
};

/**
 * Helper: si los headers no se enviaron, responde JSON; si ya se mandaron
 * (PDF a medio escribir), solo cierra el stream para no corromper el output.
 */
const responderError = (res, mensaje) => {
  if (!res.headersSent) {
    return res.status(500).json({ error: mensaje });
  }
  res.end();
};

const getClienteIdiomaSelect = async (alias = "c") =>
  (await hasPublicColumn("clientes", "idioma_preferido"))
    ? `${alias}.idioma_preferido AS idioma_preferido`
    : `'es'::character varying AS idioma_preferido`;

// ============================================================================
// GET /api/documentos/recibo-pago/:id_pago
// ============================================================================
export const documentoReciboPago = async (req, res) => {
  try {
    const { id_pago } = req.params;
    const queryLang = req.query.lang;
    const idiomaSelect = await getClienteIdiomaSelect("c");

    const { rows } = await pool.query(
      `
        SELECT
          p.*,
          ot.numero_orden,
          c.id_cliente,
          c.codigo_cliente,
          c.nombre_completo,
          c.nombre_empresa,
          c.telefono,
          c.correo,
          c.direccion_principal,
          c.nit,
          ${idiomaSelect},
          u.nombre AS registrado_por_nombre
        FROM pagos p
        INNER JOIN clientes c ON p.id_cliente = c.id_cliente
        LEFT JOIN ordenes_trabajo ot ON p.id_orden_trabajo = ot.id_orden_trabajo
        LEFT JOIN usuarios u ON p.registrado_por = u.id_usuario
        WHERE p.id_pago = $1
      `,
      [id_pago]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Pago no encontrado" });
    }

    const row = rows[0];
    const cliente = {
      id_cliente: row.id_cliente,
      codigo_cliente: row.codigo_cliente,
      nombre_completo: row.nombre_completo,
      nombre_empresa: row.nombre_empresa,
      telefono: row.telefono,
      correo: row.correo,
      direccion_principal: row.direccion_principal,
      nit: row.nit,
      idioma_preferido: row.idioma_preferido,
    };
    const pago = {
      id_pago: row.id_pago,
      fecha_pago: row.fecha_pago,
      metodo_pago: row.metodo_pago,
      monto: row.monto,
      referencia_pago: row.referencia_pago,
      observaciones: row.observaciones,
      numero_orden: row.numero_orden,
      registrado_por_nombre: row.registrado_por_nombre,
    };

    const lang = resolverIdioma({
      queryLang,
      clienteLang: cliente.idioma_preferido,
    });

    setHeadersPDF(
      res,
      `recibo-pago-${String(pago.id_pago).padStart(6, "0")}-${lang}.pdf`
    );

    await generarReciboPagoPDF({ pago, cliente, lang, output: res });
  } catch (error) {
    console.error("Error al generar recibo de pago:", error);
    responderError(res, "Error interno al generar recibo");
  }
};

// ============================================================================
// GET /api/documentos/ticket-servicio/:id_orden_trabajo
// ============================================================================
export const documentoTicketServicio = async (req, res) => {
  try {
    const { id_orden_trabajo } = req.params;
    const queryLang = req.query.lang;

    const ordenResult = await pool.query(
      `
        SELECT
          ot.*,
          c.id_cliente,
          c.nombre_completo,
          c.nombre_empresa,
          c.telefono,
          c.nit,
          c.idioma_preferido,
          p.nombre_propiedad,
          p.direccion AS propiedad_direccion,
          cu.nombre AS cuadrilla
        FROM ordenes_trabajo ot
        INNER JOIN clientes c ON ot.id_cliente = c.id_cliente
        INNER JOIN propiedades p ON ot.id_propiedad = p.id_propiedad
        LEFT JOIN cuadrillas cu ON ot.id_cuadrilla = cu.id_cuadrilla
        WHERE ot.id_orden_trabajo = $1
      `,
      [id_orden_trabajo]
    );

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    const detallesResult = await pool.query(
      `
        SELECT
          d.*,
          s.nombre AS servicio
        FROM ordenes_trabajo_detalle d
        LEFT JOIN servicios s ON d.id_servicio = s.id_servicio
        WHERE d.id_orden_trabajo = $1
        ORDER BY d.id_orden_trabajo_detalle
      `,
      [id_orden_trabajo]
    );

    const row = ordenResult.rows[0];
    const cliente = {
      nombre_completo: row.nombre_completo,
      nombre_empresa: row.nombre_empresa,
      telefono: row.telefono,
      nit: row.nit,
      idioma_preferido: row.idioma_preferido,
    };
    const propiedad = {
      nombre_propiedad: row.nombre_propiedad,
      direccion: row.propiedad_direccion,
    };
    const orden = { ...row, cuadrilla: row.cuadrilla };

    const lang = resolverIdioma({
      queryLang,
      clienteLang: cliente.idioma_preferido,
    });

    setHeadersPDF(
      res,
      `ticket-servicio-${orden.numero_orden}-${lang}.pdf`
    );

    await generarTicketServicioPDF({
      orden,
      cliente,
      propiedad,
      detalles: detallesResult.rows,
      lang,
      output: res,
    });
  } catch (error) {
    console.error("Error al generar ticket de servicio:", error);
    responderError(res, "Error interno al generar ticket de servicio");
  }
};

// ============================================================================
// GET /api/documentos/informe-orden/:id_orden_trabajo
// ============================================================================
export const documentoInformeOrden = async (req, res) => {
  try {
    const { id_orden_trabajo } = req.params;
    const queryLang = req.query.lang;

    const ordenResult = await pool.query(
      `
        SELECT
          ot.*,
          c.id_cliente,
          c.nombre_completo,
          c.nombre_empresa,
          c.telefono,
          c.nit,
          c.idioma_preferido,
          p.nombre_propiedad,
          p.direccion AS propiedad_direccion,
          cu.nombre AS cuadrilla
        FROM ordenes_trabajo ot
        INNER JOIN clientes c ON ot.id_cliente = c.id_cliente
        INNER JOIN propiedades p ON ot.id_propiedad = p.id_propiedad
        LEFT JOIN cuadrillas cu ON ot.id_cuadrilla = cu.id_cuadrilla
        WHERE ot.id_orden_trabajo = $1
      `,
      [id_orden_trabajo]
    );

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    const detallesResult = await pool.query(
      `
        SELECT
          d.*,
          s.nombre AS servicio
        FROM ordenes_trabajo_detalle d
        LEFT JOIN servicios s ON d.id_servicio = s.id_servicio
        WHERE d.id_orden_trabajo = $1
        ORDER BY d.id_orden_trabajo_detalle
      `,
      [id_orden_trabajo]
    );

    const evidenciasResult = await pool.query(
      `
        SELECT *
        FROM evidencias_orden
        WHERE id_orden_trabajo = $1 AND estado = 'ACTIVA'
        ORDER BY tipo_evidencia, orden_visual, id_evidencia
      `,
      [id_orden_trabajo]
    );

    const row = ordenResult.rows[0];
    const cliente = {
      nombre_completo: row.nombre_completo,
      nombre_empresa: row.nombre_empresa,
      telefono: row.telefono,
      nit: row.nit,
      idioma_preferido: row.idioma_preferido,
    };
    const propiedad = {
      nombre_propiedad: row.nombre_propiedad,
      direccion: row.propiedad_direccion,
    };
    const orden = { ...row, cuadrilla: row.cuadrilla };

    const lang = resolverIdioma({
      queryLang,
      clienteLang: cliente.idioma_preferido,
    });

    setHeadersPDF(
      res,
      `informe-orden-${orden.numero_orden}-${lang}.pdf`
    );

    await generarInformeOrdenPDF({
      orden,
      cliente,
      propiedad,
      detalles: detallesResult.rows,
      evidencias: evidenciasResult.rows,
      lang,
      output: res,
    });
  } catch (error) {
    console.error("Error al generar informe de orden:", error);
    responderError(res, "Error interno al generar informe de orden");
  }
};

// ============================================================================
// GET /api/documentos/estado-cuenta/:id_cliente?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// ============================================================================
export const documentoEstadoCuenta = async (req, res) => {
  try {
    const { id_cliente } = req.params;
    const queryLang = req.query.lang;

    // Defaults: últimos 30 días si no se pasa rango
    const hoy = new Date();
    const hace30 = new Date();
    hace30.setDate(hoy.getDate() - 30);
    const desde =
      req.query.desde || hace30.toISOString().slice(0, 10);
    const hasta =
      req.query.hasta || hoy.toISOString().slice(0, 10);

    // Validación básica de formato (YYYY-MM-DD)
    const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!fechaRegex.test(desde) || !fechaRegex.test(hasta)) {
      return res.status(400).json({
        error: "Formato de fecha inválido. Usá YYYY-MM-DD.",
      });
    }
    if (desde > hasta) {
      return res.status(400).json({
        error: "El rango de fechas es inválido (desde > hasta).",
      });
    }

    const clienteResult = await pool.query(
      `
        SELECT
          id_cliente, codigo_cliente, nombre_completo, nombre_empresa,
          telefono, correo, direccion_principal, nit, idioma_preferido
        FROM clientes
        WHERE id_cliente = $1
      `,
      [id_cliente]
    );

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }
    const cliente = clienteResult.rows[0];

    const pagosResult = await pool.query(
      `
        SELECT
          p.id_pago,
          p.fecha_pago,
          p.metodo_pago,
          p.monto,
          p.referencia_pago,
          ot.numero_orden
        FROM pagos p
        LEFT JOIN ordenes_trabajo ot ON p.id_orden_trabajo = ot.id_orden_trabajo
        WHERE p.id_cliente = $1
          AND p.fecha_pago >= $2
          AND p.fecha_pago <= $3
        ORDER BY p.fecha_pago DESC, p.id_pago DESC
      `,
      [id_cliente, desde, hasta]
    );

    const creditosResult = await pool.query(
      `
        SELECT
          cr.id_credito,
          cr.monto_total,
          cr.monto_pagado,
          cr.saldo_pendiente,
          cr.fecha_vencimiento,
          cr.estado,
          ot.numero_orden
        FROM creditos cr
        LEFT JOIN ordenes_trabajo ot ON cr.id_orden_trabajo = ot.id_orden_trabajo
        WHERE cr.id_cliente = $1
          AND cr.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')
        ORDER BY cr.fecha_vencimiento ASC, cr.id_credito
      `,
      [id_cliente]
    );

    const lang = resolverIdioma({
      queryLang,
      clienteLang: cliente.idioma_preferido,
    });

    setHeadersPDF(
      res,
      `estado-cuenta-${cliente.id_cliente}-${desde}-${hasta}-${lang}.pdf`
    );

    await generarEstadoCuentaPDF({
      cliente,
      pagos: pagosResult.rows,
      creditos: creditosResult.rows,
      desde,
      hasta,
      lang,
      output: res,
    });
  } catch (error) {
    console.error("Error al generar estado de cuenta:", error);
    responderError(res, "Error interno al generar estado de cuenta");
  }
};

// ============================================================================
// GET /api/documentos/recibo-abono/:id_pago_credito
// ============================================================================
// Recibo del abono aplicado a un crédito específico. id_pago_credito es la
// fila en la tabla pagos_credito que une pagos con creditos.
export const documentoReciboAbono = async (req, res) => {
  try {
    const { id_pago_credito } = req.params;
    const queryLang = req.query.lang;

    const { rows } = await pool.query(
      `
        SELECT
          pc.id_pago_credito,
          pc.monto_aplicado,
          p.id_pago,
          p.fecha_pago,
          p.metodo_pago,
          p.monto,
          p.referencia_pago,
          p.observaciones,
          cr.id_credito,
          cr.monto_total,
          cr.monto_pagado,
          cr.saldo_pendiente,
          cr.fecha_vencimiento,
          cr.estado AS credito_estado,
          ot.numero_orden,
          c.id_cliente,
          c.nombre_completo,
          c.nombre_empresa,
          c.telefono,
          c.nit,
          c.idioma_preferido,
          u.nombre AS registrado_por_nombre
        FROM pagos_credito pc
        INNER JOIN pagos p ON pc.id_pago = p.id_pago
        INNER JOIN creditos cr ON pc.id_credito = cr.id_credito
        INNER JOIN clientes c ON cr.id_cliente = c.id_cliente
        LEFT JOIN ordenes_trabajo ot ON cr.id_orden_trabajo = ot.id_orden_trabajo
        LEFT JOIN usuarios u ON p.registrado_por = u.id_usuario
        WHERE pc.id_pago_credito = $1
      `,
      [id_pago_credito]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Abono no encontrado" });
    }

    const row = rows[0];
    const cliente = {
      id_cliente: row.id_cliente,
      nombre_completo: row.nombre_completo,
      nombre_empresa: row.nombre_empresa,
      telefono: row.telefono,
      nit: row.nit,
      idioma_preferido: row.idioma_preferido,
    };
    const pago = {
      id_pago: row.id_pago,
      fecha_pago: row.fecha_pago,
      metodo_pago: row.metodo_pago,
      monto: row.monto_aplicado, // monto efectivamente aplicado a este crédito
      referencia_pago: row.referencia_pago,
      observaciones: row.observaciones,
      registrado_por_nombre: row.registrado_por_nombre,
    };
    const credito = {
      id_credito: row.id_credito,
      monto_total: row.monto_total,
      monto_pagado: row.monto_pagado,
      saldo_pendiente: row.saldo_pendiente,
      fecha_vencimiento: row.fecha_vencimiento,
      estado: row.credito_estado,
      numero_orden: row.numero_orden,
    };

    const lang = resolverIdioma({
      queryLang,
      clienteLang: cliente.idioma_preferido,
    });

    setHeadersPDF(
      res,
      `recibo-abono-${String(row.id_pago_credito).padStart(6, "0")}-${lang}.pdf`
    );

    await generarReciboAbonoPDF({
      pago,
      credito,
      cliente,
      lang,
      output: res,
    });
  } catch (error) {
    console.error("Error al generar recibo de abono:", error);
    responderError(res, "Error interno al generar recibo de abono");
  }
};

// ============================================================================
// GET /api/documentos/cotizacion/:id_cotizacion
// ============================================================================
export const documentoCotizacion = async (req, res) => {
  try {
    const { id_cotizacion } = req.params;
    const queryLang = req.query.lang;
    const formato = req.query.formato === "ticket" ? "ticket" : "full";
    const idiomaSelect = await getClienteIdiomaSelect("c");

    const cotResult = await pool.query(
      `
        SELECT
          co.*,
          c.id_cliente,
          c.nombre_completo,
          c.nombre_empresa,
          c.telefono,
          c.nit,
          ${idiomaSelect},
          p.nombre_propiedad,
          p.direccion AS propiedad_direccion
        FROM cotizaciones co
        INNER JOIN clientes c ON co.id_cliente = c.id_cliente
        LEFT JOIN propiedades p ON co.id_propiedad = p.id_propiedad
        WHERE co.id_cotizacion = $1
      `,
      [id_cotizacion]
    );

    if (cotResult.rows.length === 0) {
      return res.status(404).json({ error: "Cotización no encontrada" });
    }

    const detallesResult = await pool.query(
      `
        SELECT cd.*, s.nombre AS servicio
        FROM cotizaciones_detalle cd
        LEFT JOIN servicios s ON cd.id_servicio = s.id_servicio
        WHERE cd.id_cotizacion = $1
        ORDER BY cd.id_cotizacion_detalle
      `,
      [id_cotizacion]
    );

    const row = cotResult.rows[0];
    const cliente = {
      nombre_completo: row.nombre_completo,
      nombre_empresa: row.nombre_empresa,
      telefono: row.telefono,
      nit: row.nit,
      idioma_preferido: row.idioma_preferido,
    };
    const propiedad = row.nombre_propiedad
      ? {
          nombre_propiedad: row.nombre_propiedad,
          direccion: row.propiedad_direccion,
        }
      : null;
    const cotizacion = { ...row };

    const lang = resolverIdioma({
      queryLang,
      clienteLang: cliente.idioma_preferido,
    });

    setHeadersPDF(
      res,
      formato === "ticket"
        ? `cotizacion-ticket-${cotizacion.numero_cotizacion}-${lang}.pdf`
        : `cotizacion-${cotizacion.numero_cotizacion}-${lang}.pdf`
    );

    await generarCotizacionPDF({
      cotizacion,
      cliente,
      propiedad,
      detalles: detallesResult.rows,
      lang,
      formato,
      output: res,
    });
  } catch (error) {
    console.error("Error al generar PDF de cotización:", error);
    responderError(res, "Error interno al generar cotización");
  }
};
