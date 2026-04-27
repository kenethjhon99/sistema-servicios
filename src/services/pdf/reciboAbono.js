/**
 * Genera el recibo cuando se aplica un abono parcial/total a un crédito.
 *
 * Diferencia clave con `reciboPago.js`:
 *  - Acá el "pago" siempre vino del flujo aplicarPagoACredito y siempre
 *    está vinculado a un crédito específico.
 *  - El comprobante muestra explícitamente saldo del crédito, monto
 *    pagado acumulado, total y estado actual — para que el cliente
 *    vea cuánto le falta.
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
  formatearMonto,
} from "./base.js";

export const generarReciboAbonoPDF = ({
  pago,
  credito,
  cliente,
  lang = "es",
  output,
}) => {
  return new Promise((resolve, reject) => {
    const txt = t(lang);
    const doc = crearDocumento(`${txt.reciboAbono.titulo} ${pago.id_pago}`);

    doc.pipe(output);
    output.on("finish", resolve);
    output.on("error", reject);

    drawHeader(doc, txt);
    drawTituloDocumento(doc, txt.reciboAbono.titulo);

    doc.fontSize(10).font("Helvetica");
    drawCampo(
      doc,
      txt.reciboAbono.numeroRecibo,
      `R-${String(pago.id_pago).padStart(6, "0")}`
    );
    drawCampo(
      doc,
      txt.reciboAbono.creditoNo,
      `C-${String(credito.id_credito).padStart(6, "0")}`
    );
    drawCampo(doc, txt.comun.fecha, formatearFecha(pago.fecha_pago, lang));
    doc.moveDown(0.6);

    // Cliente
    drawCaja(doc, txt.comun.cliente, [
      [
        txt.comun.cliente,
        cliente.nombre_completo +
          (cliente.nombre_empresa ? ` (${cliente.nombre_empresa})` : ""),
      ],
      [txt.comun.nit, cliente.nit],
      [txt.comun.telefono, cliente.telefono],
    ]);

    // Detalle del abono
    const metodoLabel = txt.metodosPago[pago.metodo_pago] || pago.metodo_pago;
    drawCaja(doc, txt.reciboAbono.metodoPago, [
      [txt.reciboAbono.metodoPago, metodoLabel],
      [txt.reciboAbono.referencia, pago.referencia_pago || "—"],
      [txt.reciboAbono.ordenAsociada, credito.numero_orden || "—"],
      [txt.reciboAbono.observaciones, pago.observaciones || "—"],
    ]);

    // Estado del crédito
    drawCaja(doc, txt.reciboAbono.estadoActual, [
      [
        txt.reciboAbono.estadoActual,
        txt.reciboAbono.estados[credito.estado] || credito.estado,
      ],
      [
        txt.reciboAbono.montoTotalCredito,
        formatearMonto(credito.monto_total, txt.comun.moneda),
      ],
      [
        txt.reciboAbono.montoPagadoAcumulado,
        formatearMonto(credito.monto_pagado, txt.comun.moneda),
      ],
      [
        txt.reciboAbono.saldoActual,
        formatearMonto(credito.saldo_pendiente, txt.comun.moneda),
      ],
      [
        txt.reciboAbono.fechaVencimiento,
        formatearFecha(credito.fecha_vencimiento, lang),
      ],
    ]);

    doc.moveDown(0.5);

    // Monto abonado destacado
    drawTotalLinea(
      doc,
      txt.reciboAbono.montoAbonado,
      pago.monto,
      txt.comun.moneda
    );

    doc.moveDown(1.5);
    doc
      .fillColor("#475569")
      .fontSize(10)
      .font("Helvetica-Oblique")
      .text(txt.reciboAbono.pieGracias, { align: "center" });

    drawFooterPaginas(doc, txt, pago.registrado_por_nombre);
    doc.end();
  });
};
