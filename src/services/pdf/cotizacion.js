/**
 * Genera el PDF de una cotización (estimado).
 *
 * Estructura:
 *  - Encabezado del negocio
 *  - Número de cotización + fecha + vigencia + estado
 *  - Datos del cliente y propiedad
 *  - Tabla de detalles cotizados
 *  - Subtotal, descuento, total
 *  - Observaciones
 *  - Pie de validez (informativo, sujeto a aprobación)
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

export const generarCotizacionPDF = ({
  cotizacion,
  cliente,
  propiedad,
  detalles = [],
  lang = "es",
  formato = "full",
  output,
}) => {
  return new Promise((resolve, reject) => {
    const txt = t(lang);
    const doc = crearDocumento(`${txt.cotizacion.titulo} ${cotizacion.numero_cotizacion}`);

    doc.pipe(output);
    output.on("finish", resolve);
    output.on("error", reject);

    drawHeader(doc, txt);
    drawTituloDocumento(doc, txt.cotizacion.titulo);

    if (formato === "ticket") {
      doc.fontSize(10).font("Helvetica");
      drawCampo(doc, txt.cotizacion.numero, cotizacion.numero_cotizacion);
      drawCampo(
        doc,
        txt.cotizacion.fechaCotizacion,
        formatearFecha(cotizacion.fecha_cotizacion, lang)
      );
      drawCampo(
        doc,
        txt.cotizacion.estado,
        txt.cotizacion.estados[cotizacion.estado] || cotizacion.estado
      );
      if (cotizacion.vigencia_hasta) {
        drawCampo(
          doc,
          txt.cotizacion.vigenciaHasta,
          formatearFecha(cotizacion.vigencia_hasta, lang)
        );
      }
      doc.moveDown(0.6);

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

      detalles.forEach((detalle, index) => {
        doc
          .roundedRect(50, doc.y, 495, 62, 10)
          .fillAndStroke("#f8fafc", "#e2e8f0");
        doc
          .fillColor("#0f172a")
          .fontSize(10)
          .font("Helvetica-Bold")
          .text(`${index + 1}. ${detalle.descripcion || detalle.servicio || "-"}`, 62, doc.y + 10, {
            width: 310,
          });
        doc
          .fillColor("#475569")
          .fontSize(9)
          .font("Helvetica")
          .text(
            `${txt.comun.cantidad}: ${detalle.cantidad}  |  ${txt.comun.precioUnitario}: ${formatearMonto(
              detalle.precio_unitario,
              txt.comun.moneda
            )}`,
            62,
            doc.y + 28,
            { width: 300 }
          );
        doc
          .fillColor("#0f172a")
          .fontSize(10)
          .font("Helvetica-Bold")
          .text(formatearMonto(detalle.subtotal, txt.comun.moneda), 400, doc.y + 20, {
            width: 120,
            align: "right",
          });
        doc.y += 74;
      });

      drawTotalLinea(doc, txt.comun.total, cotizacion.total, txt.comun.moneda);

      if (cotizacion.observaciones) {
        doc.moveDown(0.4);
        doc.fillColor("#475569").fontSize(9).font("Helvetica-Bold").text(`${txt.cotizacion.observaciones}:`);
        doc.font("Helvetica").text(cotizacion.observaciones, { width: 495 });
      }

      drawFooterPaginas(doc, txt);
      doc.end();
      return;
    }

    doc.fontSize(10).font("Helvetica");
    drawCampo(doc, txt.cotizacion.numero, cotizacion.numero_cotizacion);
    drawCampo(
      doc,
      txt.cotizacion.fechaCotizacion,
      formatearFecha(cotizacion.fecha_cotizacion, lang)
    );
    if (cotizacion.vigencia_hasta) {
      drawCampo(
        doc,
        txt.cotizacion.vigenciaHasta,
        formatearFecha(cotizacion.vigencia_hasta, lang)
      );
    }
    drawCampo(
      doc,
      txt.cotizacion.estado,
      txt.cotizacion.estados[cotizacion.estado] || cotizacion.estado
    );
    doc.moveDown(0.6);

    // Cliente y propiedad
    drawCaja(doc, txt.comun.cliente, [
      [
        txt.comun.cliente,
        cliente.nombre_completo +
          (cliente.nombre_empresa ? ` (${cliente.nombre_empresa})` : ""),
      ],
      [txt.comun.nit, cliente.nit],
      [txt.comun.telefono, cliente.telefono],
    ]);

    if (propiedad) {
      drawCaja(doc, txt.comun.propiedad, [
        [txt.comun.propiedad, propiedad.nombre_propiedad],
        [txt.comun.direccion, propiedad.direccion],
      ]);
    }

    // Tabla de detalles
    if (detalles.length > 0) {
      doc
        .fillColor("#0f172a")
        .fontSize(12)
        .font("Helvetica-Bold")
        .text(txt.cotizacion.detalle);
      doc.moveDown(0.3);

      drawTabla(
        doc,
        [
          {
            label: txt.comun.descripcion,
            width: 280,
            render: (r) => r.descripcion || r.servicio || "—",
          },
          {
            label: txt.comun.cantidad,
            width: 60,
            align: "right",
            render: (r) => String(r.cantidad ?? 1),
          },
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

    // Subtotal / descuento / total
    doc.moveDown(0.3);
    const ySub = doc.y;
    doc
      .fillColor("#475569")
      .fontSize(10)
      .font("Helvetica")
      .text(txt.comun.subtotal, 50, ySub, { width: 350, align: "right" })
      .text(formatearMonto(cotizacion.subtotal, txt.comun.moneda), 400, ySub, {
        width: 145,
        align: "right",
      });
    doc.moveDown(0.3);

    if (Number(cotizacion.descuento || 0) > 0) {
      const yD = doc.y;
      doc
        .text(txt.comun.descuento, 50, yD, { width: 350, align: "right" })
        .text(
          `-${formatearMonto(cotizacion.descuento, txt.comun.moneda)}`,
          400,
          yD,
          { width: 145, align: "right" }
        );
      doc.moveDown(0.3);
    }

    drawTotalLinea(
      doc,
      txt.comun.total,
      cotizacion.total,
      txt.comun.moneda
    );

    if (cotizacion.observaciones) {
      doc.moveDown(0.5);
      doc
        .fillColor("#475569")
        .fontSize(10)
        .font("Helvetica-Bold")
        .text(`${txt.cotizacion.observaciones}:`);
      doc.font("Helvetica").text(cotizacion.observaciones, { width: 495 });
      doc.moveDown(0.5);
    }

    doc.moveDown(1.5);
    doc
      .fillColor("#475569")
      .fontSize(9)
      .font("Helvetica-Oblique")
      .text(txt.cotizacion.pieValidez, { align: "center" });

    drawFooterPaginas(doc, txt);
    doc.end();
  });
};
