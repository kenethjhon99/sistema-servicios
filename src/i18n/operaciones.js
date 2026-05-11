const formatCurrencyLabel = (value) => `$${Number(value || 0).toFixed(2)}`;

const ALERT_TITLES = {
  es: {
    SERVICIO_HOY: "Servicio programado para hoy",
    SERVICIO_MANANA: "Servicio programado para mañana",
    SERVICIO_ATRASADO: "Servicio atrasado",
    PAGO_HOY: "Crédito vence hoy",
    PAGO_MANANA: "Crédito vence mañana",
    PAGO_VENCIDO: "Crédito vencido",
  },
  en: {
    SERVICIO_HOY: "Service scheduled for today",
    SERVICIO_MANANA: "Service scheduled for tomorrow",
    SERVICIO_ATRASADO: "Overdue service",
    PAGO_HOY: "Credit due today",
    PAGO_MANANA: "Credit due tomorrow",
    PAGO_VENCIDO: "Overdue credit",
  },
};

const parseAlertContext = (alerta) => {
  const mensaje = String(alerta?.mensaje || "");

  switch (alerta?.tipo_alerta) {
    case "SERVICIO_HOY":
    case "SERVICIO_MANANA": {
      const [cliente, propiedad, servicio] = mensaje.split(" - ");
      if (!cliente || !propiedad || !servicio) return null;
      return { cliente, propiedad, servicio };
    }
    case "SERVICIO_ATRASADO": {
      const [base, pendienteDesde] = mensaje.split(" - pendiente desde ");
      if (!base || !pendienteDesde) return null;
      const [cliente, propiedad, servicio] = base.split(" - ");
      if (!cliente || !propiedad || !servicio) return null;
      return { cliente, propiedad, servicio, pendienteDesde };
    }
    case "PAGO_HOY":
    case "PAGO_MANANA": {
      const [cliente, ordenSegment, saldoSegment] = mensaje.split(" - ");
      if (!cliente || !ordenSegment || !saldoSegment) return null;
      return {
        cliente,
        numeroOrden: ordenSegment.replace(/^Orden\s+/i, "").trim(),
        saldo: saldoSegment.replace(/^Saldo\s+/i, "").trim(),
      };
    }
    case "PAGO_VENCIDO": {
      const [cliente, ordenSegment, vencioSegment, saldoSegment] = mensaje.split(" - ");
      if (!cliente || !ordenSegment || !vencioSegment || !saldoSegment) return null;
      return {
        cliente,
        numeroOrden: ordenSegment.replace(/^Orden\s+/i, "").trim(),
        fechaVencimiento: vencioSegment.replace(/^Venci[oó]\s+/i, "").trim(),
        saldo: saldoSegment.replace(/^Saldo\s+/i, "").trim(),
      };
    }
    default:
      return null;
  }
};

const renderAlertMessage = (locale, alerta, context) => {
  if (!context) return alerta.mensaje;

  switch (alerta.tipo_alerta) {
    case "SERVICIO_HOY":
    case "SERVICIO_MANANA":
      return locale === "en"
        ? `${context.cliente} - ${context.propiedad} - ${context.servicio}`
        : `${context.cliente} - ${context.propiedad} - ${context.servicio}`;
    case "SERVICIO_ATRASADO":
      return locale === "en"
        ? `${context.cliente} - ${context.propiedad} - ${context.servicio} - pending since ${context.pendienteDesde}`
        : `${context.cliente} - ${context.propiedad} - ${context.servicio} - pendiente desde ${context.pendienteDesde}`;
    case "PAGO_HOY":
    case "PAGO_MANANA":
      return locale === "en"
        ? `${context.cliente} - Order ${context.numeroOrden} - Balance ${context.saldo}`
        : `${context.cliente} - Orden ${context.numeroOrden} - Saldo ${context.saldo}`;
    case "PAGO_VENCIDO":
      return locale === "en"
        ? `${context.cliente} - Order ${context.numeroOrden} - Due ${context.fechaVencimiento} - Balance ${context.saldo}`
        : `${context.cliente} - Orden ${context.numeroOrden} - Venció ${context.fechaVencimiento} - Saldo ${context.saldo}`;
    default:
      return alerta.mensaje;
  }
};

export const localizeAlert = (alerta, locale = "es") => {
  if (!alerta || locale === "es") return alerta;

  const context = parseAlertContext(alerta);
  return {
    ...alerta,
    titulo: ALERT_TITLES[locale]?.[alerta.tipo_alerta] || alerta.titulo,
    mensaje: renderAlertMessage(locale, alerta, context),
  };
};

export const localizeAlerts = (rows = [], locale = "es") =>
  rows.map((row) => localizeAlert(row, locale));

const resolveAuditTarget = (evento) => {
  const next = evento?.valores_nuevos || {};
  const prev = evento?.valores_anteriores || {};

  const value =
    next.username ||
    next.nombre_completo ||
    next.nombre_propiedad ||
    next.nombre ||
    next.numero_orden ||
    next.numero_cotizacion ||
    prev.username ||
    prev.nombre_completo ||
    prev.nombre_propiedad ||
    prev.nombre ||
    prev.numero_orden ||
    prev.numero_cotizacion ||
    evento?.id_registro;

  return String(value);
};

const resolveAuditStatus = (evento) =>
  evento?.valores_nuevos?.estado || evento?.valores_anteriores?.estado || "";

const resolveAuditAmount = (evento) => {
  const next = evento?.valores_nuevos || {};
  const prev = evento?.valores_anteriores || {};

  if (next.monto !== undefined) return formatCurrencyLabel(next.monto);
  if (next.monto_total !== undefined) return formatCurrencyLabel(next.monto_total);
  if (next.monto_pagado !== undefined && prev.monto_pagado !== undefined) {
    return formatCurrencyLabel(Number(next.monto_pagado) - Number(prev.monto_pagado));
  }
  return null;
};

const buildAuditDescriptionEn = (evento) => {
  const target = resolveAuditTarget(evento);
  const status = resolveAuditStatus(evento);
  const amount = resolveAuditAmount(evento);
  const table = evento?.tabla_afectada;
  const action = evento?.accion;

  if (action === "LOGIN") {
    return `Successful sign-in for user ${target}`;
  }

  if (action === "RESET_PASSWORD") {
    return `Password was reset for user ${target}`;
  }

  if (action === "PAGO" && amount) {
    return `Payment of ${amount} was recorded`;
  }

  if (action === "ABONO" && amount) {
    return `Payment of ${amount} was applied to credit ${target}`;
  }

  if (action === "CONVERTIR" && table === "cotizaciones") {
    return `Quote ${target} was converted into a work order`;
  }

  const tableLabels = {
    usuarios: "user",
    clientes: "client",
    propiedades: "property",
    categorias_servicio: "category",
    servicios: "service",
    programaciones_servicio: "schedule",
    ordenes_trabajo: "work order",
    ordenes_trabajo_detalle: "work order detail",
    evidencias_orden: "evidence",
    pagos: "payment",
    creditos: "credit",
    pagos_credito: "credit payment",
    cotizaciones: "quote",
    cotizaciones_detalle: "quote detail",
    alertas: "alert",
  };

  const label = tableLabels[table] || "record";

  switch (action) {
    case "CREAR":
      return `${label.charAt(0).toUpperCase() + label.slice(1)} ${target} was created`;
    case "ACTUALIZAR":
      return `${label.charAt(0).toUpperCase() + label.slice(1)} ${target} was updated`;
    case "CAMBIAR_ESTADO":
      if (table === "ordenes_trabajo_detalle") {
        return `Previous details for work order ${target} were replaced`;
      }
      return `Status for ${label} ${target} changed to ${status}`;
    case "CANCELAR":
      return `${label.charAt(0).toUpperCase() + label.slice(1)} ${target} was canceled`;
    default:
      return evento?.descripcion || "";
  }
};

export const localizeAuditEvent = (evento, locale = "es") => {
  if (!evento || locale === "es") return evento;

  return {
    ...evento,
    descripcion: buildAuditDescriptionEn(evento),
  };
};

export const localizeAuditRows = (rows = [], locale = "es") =>
  rows.map((row) => localizeAuditEvent(row, locale));
