/**
 * Genera el estado de cuenta del cliente para un rango de fechas.
 *
 * Contiene:
 *  - Datos del cliente
 *  - Tabla de pagos realizados en el rango
 *  - Tabla de créditos pendientes / vencidos (sin filtrar por rango — siempre
 *    los actuales, porque "creditos pendientes hace 6 meses" no aporta)
 *  - Totales: total pagado en período, total adeudado actual.
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

export const generarEstadoCuentaPDF = ({
  cliente,
  pagos = [],
  creditos = [],
  desde,
  hasta,
  lang = "es",
  output,
}) => {
  return new Promise((resolve, reject) => {
    const txt = t(lang);
    const doc = crearDocumento(`${txt.estadoCuenta.titulo} - ${cliente.nombre_completo}`);

    doc.pipe(output);
    output.on("finish", resolve);
    output.on("error", reject);

    drawHeader(doc, txt);
    drawTituloDocumento(doc, txt.estadoCuenta.titulo);

    // Datos del cliente y rango
    drawCaja(doc, txt.comun.cliente, [
      [
        txt.comun.cliente,
        cliente.nombre_completo +
          (cliente.nombre_empresa ? ` (${cliente.nombre_empresa})` : ""),
      ],
      [txt.comun.nit, cliente.nit],
      [txt.comun.telefono, cliente.telefono],
      [txt.comun.correo, cliente.correo],
    ]);

    drawCaja(doc, txt.estadoCuenta.rangoFechas, [
      [txt.comun.desde, formatearFecha(desde, lang)],
      [txt.comun.hasta, formatearFecha(hasta, lang)],
    ]);

    // Pagos del período
    doc
      .fillColor("#0f172a")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(txt.estadoCuenta.pagosRealizados);
    doc.moveDown(0.3);

    if (pagos.length === 0) {
      doc
        .fillColor("#94a3b8")
        .fontSize(10)
        .font("Helvetica-Oblique")
        .text(txt.estadoCuenta.sinPagos);
      doc.moveDown(0.5);
    } else {
      drawTabla(
        doc,
        [
          {
            label: txt.estadoCuenta.fechaPago,
            width: 80,
            render: (r) => formatearFecha(r.fecha_pago, lang),
          },
          {
            label: txt.estadoCuenta.metodo,
            width: 90,
            render: (r) => txt.metodosPago[r.metodo_pago] || r.metodo_pago,
          },
          {
            label: txt.estadoCuenta.orden,
            width: 130,
            render: (r) => r.numero_orden || "—",
          },
          {
            label: txt.estadoCuenta.referencia,
            width: 110,
            render: (r) => r.referencia_pago || "—",
          },
          {
            label: txt.estadoCuenta.monto,
            width: 85,
            align: "right",
            render: (r) => formatearMonto(r.monto, txt.comun.moneda),
          },
        ],
        pagos
      );
    }

    const totalPagado = pagos.reduce((sum, p) => sum + Number(p.monto || 0), 0);
    drawTotalLinea(
      doc,
      txt.estadoCuenta.totalPagado,
      totalPagado,
      txt.comun.moneda
    );

    // Créditos pendientes
    doc.moveDown(0.5);
    doc
      .fillColor("#0f172a")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(txt.estadoCuenta.creditosPendientes);
    doc.moveDown(0.3);

    if (creditos.length === 0) {
      doc
        .fillColor("#94a3b8")
        .fontSize(10)
        .font("Helvetica-Oblique")
        .text(txt.estadoCuenta.sinCreditos);
      doc.moveDown(0.5);
    } else {
      drawTabla(
        doc,
        [
          {
            label: txt.estadoCuenta.orden,
            width: 130,
            render: (r) => r.numero_orden || `#${r.id_credito}`,
          },
          {
            label: txt.estadoCuenta.fechaVencimiento,
            width: 90,
            render: (r) => formatearFecha(r.fecha_vencimiento, lang),
          },
          {
            label: txt.estadoCuenta.estado,
            width: 80,
            render: (r) =>
              txt.estadoCuenta.estadosCredito[r.estado] || r.estado,
          },
          {
            label: txt.estadoCuenta.montoTotal,
            width: 80,
            align: "right",
            render: (r) => formatearMonto(r.monto_total, txt.comun.moneda),
          },
          {
            label: txt.estadoCuenta.montoPagado,
            width: 60,
            align: "right",
            render: (r) => formatearMonto(r.monto_pagado, txt.comun.moneda),
          },
          {
            label: txt.estadoCuenta.saldoPendiente,
            width: 55,
            align: "right",
            render: (r) => formatearMonto(r.saldo_pendiente, txt.comun.moneda),
          },
        ],
        creditos
      );
    }

    const totalAdeudado = creditos.reduce(
      (sum, c) => sum + Number(c.saldo_pendiente || 0),
      0
    );
    drawTotalLinea(
      doc,
      txt.estadoCuenta.totalAdeudado,
      totalAdeudado,
      txt.comun.moneda
    );

    // Pie con fecha de generación
    doc.moveDown(1);
    const ahora = new Date();
    doc
      .fillColor("#475569")
      .fontSize(9)
      .font("Helvetica-Oblique")
      .text(`${txt.estadoCuenta.pieResumen} ${formatearFecha(ahora, lang)}`, {
        align: "center",
      });

    drawFooterPaginas(doc, txt);
    doc.end();
  });
};
