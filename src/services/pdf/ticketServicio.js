/**
 * Genera el "comprobante de servicio realizado" — versión corta que se le
 * deja al cliente cuando se completa una visita. Incluye solo lo esencial:
 * orden, fecha, servicios realizados, observaciones, quién recibió.
 *
 * Para detalle completo con evidencias usar `informeOrden.js`.
 */
import { t } from "../../i18n/documentos.js";
import {
  crearDocumento,
  drawHeader,
  drawTituloDocumento,
  drawCaja,
  drawCampo,
  drawTabla,
  drawTotalLinea,
  drawFooterPaginas,
  formatearFecha,
  formatearMonto,
} from "./base.js";

export const generarTicketServicioPDF = ({
  orden,
  cliente,
  propiedad,
  detalles = [],
  lang = "es",
  output,
}) => {
  return new Promise((resolve, reject) => {
    const txt = t(lang);
    const doc = crearDocumento(`${txt.ticketServicio.titulo} ${orden.numero_orden}`);

    doc.pipe(output);
    output.on("finish", resolve);
    output.on("error", reject);

    drawHeader(doc, txt);
    drawTituloDocumento(doc, txt.ticketServicio.titulo);

    doc.fontSize(10).font("Helvetica");
    drawCampo(doc, txt.ticketServicio.numeroOrden, orden.numero_orden);
    drawCampo(
      doc,
      txt.ticketServicio.fechaServicio,
      formatearFecha(orden.fecha_servicio, lang)
    );
    doc.moveDown(0.6);

    drawCaja(doc, txt.comun.cliente, [
      [
        txt.comun.cliente,
        cliente.nombre_completo +
          (cliente.nombre_empresa ? ` (${cliente.nombre_empresa})` : ""),
      ],
      [txt.comun.telefono, cliente.telefono],
      [
        txt.comun.propiedad,
        propiedad
          ? `${propiedad.nombre_propiedad} — ${propiedad.direccion}`
          : "—",
      ],
    ]);

    drawCaja(doc, txt.ticketServicio.titulo, [
      [txt.ticketServicio.cuadrilla, orden.cuadrilla || "—"],
      [txt.ticketServicio.horaInicio, orden.hora_inicio_real || "—"],
      [txt.ticketServicio.horaFin, orden.hora_fin_real || "—"],
      [txt.ticketServicio.duracion, orden.duracion_real_min ?? "—"],
      [txt.ticketServicio.nombreRecibe, orden.nombre_recibe || "—"],
      [
        txt.ticketServicio.confirmadoCliente,
        orden.confirmado_por_cliente ? txt.ticketServicio.si : txt.ticketServicio.no,
      ],
    ]);

    if (detalles.length > 0) {
      doc
        .fillColor("#0f172a")
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(txt.ticketServicio.serviciosRealizados);
      doc.moveDown(0.3);

      drawTabla(
        doc,
        [
          { label: txt.comun.descripcion, width: 280, render: (r) => r.servicio || r.descripcion_servicio || "—" },
          { label: txt.comun.cantidad, width: 60, align: "right", render: (r) => String(r.cantidad ?? 1) },
          {
            label: txt.comun.precioUnitario,
            width: 75,
            align: "right",
            render: (r) => formatearMonto(r.precio_unitario, txt.comun.moneda),
          },
          {
            label: txt.comun.subtotal,
            width: 80,
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
        .text(`${txt.ticketServicio.observaciones}:`);
      doc.font("Helvetica").text(orden.observaciones_finales, { width: 495 });
      doc.moveDown(0.5);
    }

    if (orden.total_orden !== undefined && orden.total_orden !== null) {
      drawTotalLinea(doc, txt.comun.total, orden.total_orden, txt.comun.moneda);
    }

    doc.moveDown(1.5);
    doc
      .fillColor("#475569")
      .fontSize(10)
      .font("Helvetica-Oblique")
      .text(txt.ticketServicio.pieGracias, { align: "center" });

    drawFooterPaginas(doc, txt);
    doc.end();
  });
};
