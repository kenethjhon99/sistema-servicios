/**
 * Genera un recibo de pago en PDF.
 *
 * Recibe el objeto pago completo (con joins a cliente y orden si aplica)
 * y escribe el PDF al stream `output` (típicamente res). Devuelve cuando
 * el PDF terminó de escribirse.
 *
 * Forma de los datos esperados:
 *   pago: {
 *     id_pago, fecha_pago, metodo_pago, monto,
 *     referencia_pago, observaciones,
 *     numero_orden,             // opcional, viene del JOIN
 *     registrado_por_nombre,    // opcional
 *   }
 *   cliente: {
 *     id_cliente, codigo_cliente, nombre_completo, nombre_empresa,
 *     telefono, correo, direccion_principal, nit, idioma_preferido,
 *   }
 */
import { t } from "../../i18n/documentos.js";
import {
  crearDocumento,
  drawHeader,
  drawTituloDocumento,
  drawCaja,
  drawCampo,
  drawTotalLinea,
  drawFooterPaginas,
  formatearFecha,
} from "./base.js";

export const generarReciboPagoPDF = ({ pago, cliente, lang = "es", output }) => {
  return new Promise((resolve, reject) => {
    const txt = t(lang);

    const doc = crearDocumento(`${txt.reciboPago.titulo} ${pago.id_pago}`);

    doc.pipe(output);
    output.on("finish", resolve);
    output.on("error", reject);

    // Header con datos del negocio
    drawHeader(doc, txt);

    // Título del documento
    drawTituloDocumento(doc, txt.reciboPago.titulo);

    // Número de recibo y fecha — caja arriba
    doc.fontSize(10).font("Helvetica");
    drawCampo(
      doc,
      txt.reciboPago.numeroRecibo,
      `R-${String(pago.id_pago).padStart(6, "0")}`
    );
    drawCampo(doc, txt.comun.fecha, formatearFecha(pago.fecha_pago, lang));
    doc.moveDown(0.8);

    // Datos del cliente
    drawCaja(doc, txt.comun.cliente, [
      [
        txt.comun.cliente,
        cliente.nombre_completo +
          (cliente.nombre_empresa ? ` (${cliente.nombre_empresa})` : ""),
      ],
      [txt.comun.nit, cliente.nit],
      [txt.comun.telefono, cliente.telefono],
      [txt.comun.direccion, cliente.direccion_principal],
    ]);

    // Detalle del pago
    const metodoLabel =
      txt.reciboPago.metodos[pago.metodo_pago] || pago.metodo_pago;

    drawCaja(doc, txt.reciboPago.metodoPago, [
      [txt.reciboPago.metodoPago, metodoLabel],
      [txt.reciboPago.referencia, pago.referencia_pago || "—"],
      [txt.reciboPago.ordenAsociada, pago.numero_orden || "—"],
      [
        txt.reciboPago.observaciones,
        pago.observaciones || "—",
      ],
    ]);

    doc.moveDown(0.5);

    // Total recibido — destacado
    drawTotalLinea(
      doc,
      txt.reciboPago.montoRecibido,
      pago.monto,
      txt.comun.moneda
    );

    // Mensaje de cierre
    doc.moveDown(2);
    doc
      .fillColor("#475569")
      .fontSize(10)
      .font("Helvetica-Oblique")
      .text(txt.reciboPago.pieGracias, { align: "center" });

    // Footer con número de página
    drawFooterPaginas(doc, txt, pago.registrado_por_nombre);

    doc.end();
  });
};
