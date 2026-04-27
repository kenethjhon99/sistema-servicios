/**
 * Genera el informe completo de orden de trabajo: todos los datos de la
 * orden + tabla de servicios + listado de evidencias (sin embed de imagen,
 * solo URL — embedimos solo si decidimos descargar el blob remoto, lo cual
 * es problemático en términos de tiempo y seguridad).
 *
 * Para una versión corta para entregar al cliente al momento, usar
 * `ticketServicio.js`.
 */
import { t } from "../../i18n/documentos.js";
import {
  crearDocumento,
  drawHeader,
  drawTituloDocumento,
  drawCaja,
  drawTabla,
  drawTotalLinea,
  drawFooterPaginas,
  formatearFecha,
  formatearMonto,
} from "./base.js";

export const generarInformeOrdenPDF = ({
  orden,
  cliente,
  propiedad,
  detalles = [],
  evidencias = [],
  lang = "es",
  output,
}) => {
  return new Promise((resolve, reject) => {
    const txt = t(lang);
    const doc = crearDocumento(`${txt.informeOrden.titulo} ${orden.numero_orden}`);

    doc.pipe(output);
    output.on("finish", resolve);
    output.on("error", reject);

    drawHeader(doc, txt);
    drawTituloDocumento(doc, txt.informeOrden.titulo);

    // Datos de cabecera de la orden
    drawCaja(doc, `${txt.informeOrden.numeroOrden} ${orden.numero_orden}`, [
      [
        txt.informeOrden.estado,
        txt.informeOrden.estados[orden.estado] || orden.estado,
      ],
      [txt.informeOrden.fechaServicio, formatearFecha(orden.fecha_servicio, lang)],
      [txt.informeOrden.tipoVisita, orden.tipo_visita],
      [txt.informeOrden.origen, orden.origen],
      [txt.informeOrden.cuadrilla, orden.cuadrilla || "—"],
    ]);

    // Cliente y propiedad
    drawCaja(doc, txt.comun.cliente, [
      [
        txt.comun.cliente,
        cliente.nombre_completo +
          (cliente.nombre_empresa ? ` (${cliente.nombre_empresa})` : ""),
      ],
      [txt.comun.telefono, cliente.telefono],
      [txt.comun.nit, cliente.nit],
    ]);

    if (propiedad) {
      drawCaja(doc, txt.comun.propiedad, [
        [txt.comun.propiedad, propiedad.nombre_propiedad],
        [txt.comun.direccion, propiedad.direccion],
      ]);
    }

    // Horarios y duración
    drawCaja(doc, "⏱", [
      [txt.informeOrden.horaInicioProgramada, orden.hora_inicio_programada || "—"],
      [txt.informeOrden.horaInicio, orden.hora_inicio_real || "—"],
      [txt.informeOrden.horaFin, orden.hora_fin_real || "—"],
      [txt.informeOrden.duracionReal, orden.duracion_real_min ?? "—"],
    ]);

    if (orden.estado === "CANCELADA" && orden.motivo_cancelacion) {
      doc.moveDown(0.3);
      doc
        .fillColor("#dc2626")
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`${txt.informeOrden.motivoCancelacion}:`);
      doc.font("Helvetica").text(orden.motivo_cancelacion, { width: 495 });
      doc.moveDown(0.5);
    }

    if (orden.observaciones_previas) {
      doc
        .fillColor("#475569")
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`${txt.informeOrden.observacionesPrevias}:`);
      doc.font("Helvetica").text(orden.observaciones_previas, { width: 495 });
      doc.moveDown(0.5);
    }

    // Tabla de servicios
    if (detalles.length > 0) {
      doc
        .fillColor("#0f172a")
        .fontSize(12)
        .font("Helvetica-Bold")
        .text(txt.informeOrden.detalle);
      doc.moveDown(0.3);

      drawTabla(
        doc,
        [
          {
            label: txt.comun.descripcion,
            width: 260,
            render: (r) => r.servicio || r.descripcion_servicio || "—",
          },
          {
            label: txt.comun.cantidad,
            width: 60,
            align: "right",
            render: (r) => String(r.cantidad ?? 1),
          },
          {
            label: txt.comun.precioUnitario,
            width: 80,
            align: "right",
            render: (r) => formatearMonto(r.precio_unitario, txt.comun.moneda),
          },
          {
            label: txt.comun.subtotal,
            width: 95,
            align: "right",
            render: (r) => formatearMonto(r.subtotal, txt.comun.moneda),
          },
        ],
        detalles
      );
    }

    if (orden.observaciones_finales) {
      doc.moveDown(0.5);
      doc
        .fillColor("#475569")
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`${txt.informeOrden.observacionesFinales}:`);
      doc.font("Helvetica").text(orden.observaciones_finales, { width: 495 });
      doc.moveDown(0.5);
    }

    // Totales
    if (orden.subtotal !== undefined && orden.subtotal !== null) {
      doc.moveDown(0.3);
      const yT = doc.y;
      doc
        .fillColor("#475569")
        .fontSize(10)
        .font("Helvetica")
        .text(txt.comun.subtotal, 50, yT, { width: 350, align: "right" })
        .text(formatearMonto(orden.subtotal, txt.comun.moneda), 400, yT, {
          width: 145,
          align: "right",
        });
      doc.moveDown(0.3);

      if (Number(orden.descuento || 0) > 0) {
        const yD = doc.y;
        doc
          .text(txt.comun.descuento, 50, yD, { width: 350, align: "right" })
          .text(`-${formatearMonto(orden.descuento, txt.comun.moneda)}`, 400, yD, {
            width: 145,
            align: "right",
          });
        doc.moveDown(0.3);
      }
    }

    drawTotalLinea(doc, txt.comun.total, orden.total_orden ?? 0, txt.comun.moneda);

    // Evidencias
    doc.moveDown(0.6);
    doc
      .fillColor("#0f172a")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(txt.informeOrden.evidencias);
    doc.moveDown(0.3);

    if (evidencias.length === 0) {
      doc
        .fillColor("#94a3b8")
        .fontSize(10)
        .font("Helvetica-Oblique")
        .text(txt.informeOrden.sinEvidencias);
    } else {
      drawTabla(
        doc,
        [
          {
            label: "#",
            width: 35,
            align: "right",
            render: (r) => String(r.orden_visual ?? "—"),
          },
          {
            label: "Tipo",
            width: 80,
            render: (r) =>
              txt.informeOrden.tiposEvidencia[r.tipo_evidencia] || r.tipo_evidencia,
          },
          { label: txt.comun.descripcion, width: 200, key: "descripcion" },
          { label: "URL", width: 180, key: "archivo_url" },
        ],
        evidencias
      );
    }

    drawFooterPaginas(doc, txt);
    doc.end();
  });
};
