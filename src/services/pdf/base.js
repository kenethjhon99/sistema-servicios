/**
 * Helpers compartidos para generación de PDFs con pdfkit.
 *
 * Convenciones del layout:
 *  - Tamaño A4 (595 x 842 pts)
 *  - Margen 50pt en todos los lados
 *  - Header: nombre del negocio + datos de contacto, líneas debajo
 *  - Footer: número de página + "Generado el ..."
 *  - Body: 50pt → 792pt verticales utilizables
 *
 * Cada generador concreto (recibo, ticket, informe…) recibe un PDFDocument
 * ya inicializado y dibuja su contenido encima.
 */
import PDFDocument from "pdfkit";

// Datos del negocio — vienen del .env con placeholders mientras el cliente
// no los proporcione. Se leen acá para no acoplar pdfkit a env.js.
const business = () => ({
  nombre: process.env.BUSINESS_NAME || "[Nombre del Negocio]",
  direccion: process.env.BUSINESS_ADDRESS || "[Dirección del Negocio]",
  telefono: process.env.BUSINESS_PHONE || "[Teléfono]",
  nit: process.env.BUSINESS_NIT || "[NIT]",
  correo: process.env.BUSINESS_EMAIL || "",
});

const COLORS = {
  primario: "#0f172a",      // slate-900
  secundario: "#475569",    // slate-600
  suave: "#94a3b8",         // slate-400
  borde: "#e2e8f0",         // slate-200
  acento: "#16a34a",        // green-600
};

/**
 * Crea un PDFDocument A4 con margen estándar y bufferPages habilitado
 * (necesario para escribir números de página al final).
 */
export const crearDocumento = (titulo) => {
  return new PDFDocument({
    size: "A4",
    margin: 50,
    bufferPages: true,
    info: {
      Title: titulo,
      Producer: business().nombre,
    },
  });
};

/**
 * Dibuja el header del documento: nombre del negocio + datos de contacto
 * + línea separadora. Devuelve la Y donde puede empezar el contenido.
 */
export const drawHeader = (doc, txt) => {
  const b = business();
  const startY = doc.y;

  doc
    .fillColor(COLORS.primario)
    .fontSize(18)
    .font("Helvetica-Bold")
    .text(b.nombre, { align: "left" });

  doc.moveDown(0.2);

  doc
    .fillColor(COLORS.secundario)
    .fontSize(9)
    .font("Helvetica")
    .text(b.direccion);

  const contactos = [
    b.telefono && `${txt.comun.telefono}: ${b.telefono}`,
    b.nit && `${txt.comun.nit}: ${b.nit}`,
    b.correo && `${txt.comun.correo}: ${b.correo}`,
  ]
    .filter(Boolean)
    .join("  ·  ");

  if (contactos) {
    doc.text(contactos);
  }

  // Línea separadora
  const lineY = doc.y + 8;
  doc
    .strokeColor(COLORS.borde)
    .lineWidth(1)
    .moveTo(50, lineY)
    .lineTo(545, lineY)
    .stroke();

  doc.y = lineY + 15;
  return startY;
};

/**
 * Dibuja un título de documento centrado y prominente.
 */
export const drawTituloDocumento = (doc, titulo) => {
  doc
    .fillColor(COLORS.primario)
    .fontSize(20)
    .font("Helvetica-Bold")
    .text(titulo, { align: "center" });
  doc.moveDown(1);
};

/**
 * Dibuja un par "etiqueta: valor" en una sola línea con la etiqueta en gris.
 */
export const drawCampo = (doc, etiqueta, valor) => {
  doc
    .fillColor(COLORS.suave)
    .fontSize(9)
    .font("Helvetica")
    .text(etiqueta + ":", { continued: true, lineBreak: false })
    .fillColor(COLORS.primario)
    .font("Helvetica-Bold")
    .text(" " + (valor ?? "—"), { lineBreak: true });
};

/**
 * Dibuja una caja con datos clave-valor (ej: datos del cliente).
 */
export const drawCaja = (doc, titulo, campos) => {
  doc
    .fillColor(COLORS.primario)
    .fontSize(11)
    .font("Helvetica-Bold")
    .text(titulo);
  doc.moveDown(0.3);

  campos.forEach(([etiqueta, valor]) => {
    drawCampo(doc, etiqueta, valor);
  });
  doc.moveDown(0.7);
};

/**
 * Dibuja la línea final del total (con label a la izquierda y monto a la
 * derecha en negrita, color acento).
 */
export const drawTotalLinea = (doc, etiqueta, monto, moneda = "$") => {
  const y = doc.y;
  doc
    .strokeColor(COLORS.borde)
    .lineWidth(1)
    .moveTo(50, y)
    .lineTo(545, y)
    .stroke();

  doc.moveDown(0.4);

  const yTotal = doc.y;
  doc
    .fillColor(COLORS.primario)
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(etiqueta, 50, yTotal, { width: 350, align: "left" });

  doc
    .fillColor(COLORS.acento)
    .fontSize(14)
    .font("Helvetica-Bold")
    .text(`${moneda}${Number(monto).toFixed(2)}`, 400, yTotal, {
      width: 145,
      align: "right",
    });

  doc.moveDown(1);
};

/**
 * Recorre todas las páginas del buffer y dibuja en el footer:
 *  - "Generado el DD-MM-YYYY HH:mm por <usuario>"
 *  - "Página N de M"
 *
 * Llamar al final, justo antes de doc.end().
 */
export const drawFooterPaginas = (doc, txt, generadoPor = null) => {
  const range = doc.bufferedPageRange();
  const total = range.count;
  const fechaGen = new Date().toLocaleString("es-GT", {
    dateStyle: "short",
    timeStyle: "short",
  });

  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);
    const yFooter = 800;

    doc
      .fillColor(COLORS.suave)
      .fontSize(8)
      .font("Helvetica")
      .text(
        `${txt.comun.generadoEl} ${fechaGen}` +
          (generadoPor ? ` · ${txt.comun.generadoPor} ${generadoPor}` : ""),
        50,
        yFooter,
        { width: 350, align: "left" }
      )
      .text(
        `${txt.comun.pagina} ${i - range.start + 1} ${txt.comun.de} ${total}`,
        400,
        yFooter,
        { width: 145, align: "right" }
      );
  }
};

/**
 * Dibuja una tabla simple con encabezado + filas.
 * Cada columna define su `width` en puntos y opcionalmente `render(row)` para
 * formatear la celda. Usa zebra striping y maneja salto de página.
 *
 * @param {PDFDocument} doc
 * @param {Array<{label: string, key?: string, render?: (row: any) => string, width: number, align?: 'left'|'right'|'center'}>} columns
 * @param {Array<object>} rows
 */
export const drawTabla = (doc, columns, rows) => {
  const startX = 50;
  const padding = 6;
  const headerHeight = 22;
  const rowHeight = 18;
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);

  // Header
  let y = doc.y;
  doc.fillColor("#f1f5f9").rect(startX, y, totalWidth, headerHeight).fill();

  let x = startX;
  doc.fillColor(COLORS.primario).fontSize(9).font("Helvetica-Bold");
  columns.forEach((col) => {
    doc.text(col.label, x + padding, y + 7, {
      width: col.width - padding * 2,
      align: col.align || "left",
      lineBreak: false,
    });
    x += col.width;
  });

  y += headerHeight;

  // Filas con zebra striping
  doc.font("Helvetica").fillColor(COLORS.primario).fontSize(9);
  rows.forEach((row, i) => {
    if (y + rowHeight > 770) {
      doc.addPage();
      y = doc.y;
    }

    if (i % 2 === 0) {
      doc
        .fillColor("#f8fafc")
        .rect(startX, y, totalWidth, rowHeight)
        .fill()
        .fillColor(COLORS.primario);
    }

    let cx = startX;
    columns.forEach((col) => {
      const valor = col.render ? col.render(row) : row[col.key] ?? "—";
      doc.text(String(valor), cx + padding, y + 5, {
        width: col.width - padding * 2,
        align: col.align || "left",
        lineBreak: false,
        ellipsis: true,
      });
      cx += col.width;
    });

    y += rowHeight;
  });

  doc.y = y + 5;

  doc
    .strokeColor(COLORS.borde)
    .lineWidth(0.5)
    .moveTo(startX, doc.y)
    .lineTo(startX + totalWidth, doc.y)
    .stroke();

  doc.moveDown(0.5);
};

/**
 * Formatea una fecha (string o Date) en formato local corto.
 */
export const formatearFecha = (fecha, lang = "es") => {
  if (!fecha) return "—";
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d.getTime())) return String(fecha);
  const locale = lang === "en" ? "en-US" : "es-GT";
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

/**
 * Formatea un monto numérico a "Q123.45".
 */
export const formatearMonto = (monto, moneda = "$") => {
  const n = Number(monto || 0);
  return `${moneda}${n.toFixed(2)}`;
};
