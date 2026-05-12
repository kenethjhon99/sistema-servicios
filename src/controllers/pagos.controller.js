import { pool } from "../config/db.js";
import { apiErrorText } from "../i18n/apiMessages.js";
import { registrarAuditoria } from "../utils/auditoria.js";
import { hasPublicColumn } from "../utils/schema.js";

const METODOS_PAGO_VALIDOS = [
  "EFECTIVO",
  "TRANSFERENCIA",
  "DEPOSITO",
  "TARJETA",
  "OTRO",
];

const ESTADOS_CREDITO_VALIDOS = [
  "PENDIENTE",
  "PARCIAL",
  "PAGADO",
  "VENCIDO",
  "CANCELADO",
];
const MEDIOS_SEGUIMIENTO_VALIDOS = ["LLAMADA", "WHATSAPP", "CORREO", "VISITA", "OTRO"];
const RESULTADOS_SEGUIMIENTO_VALIDOS = [
  "PENDIENTE",
  "SIN_RESPUESTA",
  "PROMESA_PAGO",
  "ABONO_REALIZADO",
  "REAGENDADO",
  "DISPUTA",
  "RECORDATORIO",
];
const formatCurrencyLabel = (value) => `$${Number(value || 0).toFixed(2)}`;
const COLLECTION_DEFAULT_ACTIVE_STATES = ["PENDIENTE", "PARCIAL", "VENCIDO"];
const BOOLEAN_TRUE_VALUES = new Set(["true", "1", "yes", "si"]);

const parseBooleanQuery = (value) => BOOLEAN_TRUE_VALUES.has(String(value || "").toLowerCase());

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

const buildSeguimientoDescription = ({ cliente, medio_contacto, resultado, fecha_seguimiento }) =>
  `Seguimiento de cobranza para ${cliente} por ${medio_contacto} con resultado ${resultado} en ${fecha_seguimiento}`;

const soportaSeguimientosCobranza = () =>
  hasPublicColumn("cobranza_seguimientos", "id_seguimiento");
const soportaResponsableSeguimientoCobranza = () =>
  hasPublicColumn("cobranza_seguimientos", "id_usuario_responsable");

const buildCobranzaCreditoFilters = ({ estado, id_cliente, solo_vencidos, solo_parciales }) => {
  const conditions = ["1=1"];
  const values = [];
  let index = 1;

  if (estado) {
    conditions.push(`cr.estado = $${index}`);
    values.push(estado.toUpperCase());
    index += 1;
  } else {
    conditions.push(`cr.estado = ANY($${index})`);
    values.push(COLLECTION_DEFAULT_ACTIVE_STATES);
    index += 1;
  }

  if (id_cliente) {
    conditions.push(`cr.id_cliente = $${index}`);
    values.push(Number(id_cliente));
    index += 1;
  }

  if (solo_parciales) {
    conditions.push(`cr.estado = 'PARCIAL'`);
  }

  if (solo_vencidos) {
    conditions.push(`cr.fecha_vencimiento < CURRENT_DATE`);
    conditions.push(`COALESCE(cr.saldo_pendiente, 0) > 0`);
  }

  return {
    whereClause: `WHERE ${conditions.join(" AND ")}`,
    values,
  };
};

const buildCobranzaPagoFilters = ({ fecha_desde, fecha_hasta, id_cliente }) => {
  const conditions = ["p.fecha_pago IS NOT NULL"];
  const values = [];
  let index = 1;

  if (id_cliente) {
    conditions.push(`p.id_cliente = $${index}`);
    values.push(Number(id_cliente));
    index += 1;
  }

  if (fecha_desde) {
    conditions.push(`p.fecha_pago >= $${index}`);
    values.push(fecha_desde);
    index += 1;
  }

  if (fecha_hasta) {
    conditions.push(`p.fecha_pago <= $${index}`);
    values.push(fecha_hasta);
    index += 1;
  }

  return {
    whereClause: `WHERE ${conditions.join(" AND ")}`,
    values,
  };
};

const recalcularEstadoCredito = (montoTotal, montoPagado, fechaVencimiento) => {
  const total = Number(montoTotal);
  const pagado = Number(montoPagado);
  const hoy = new Date();
  const vence = new Date(fechaVencimiento);

  if (pagado >= total) return "PAGADO";
  if (pagado > 0 && pagado < total) return "PARCIAL";
  if (pagado === 0 && vence < hoy) return "VENCIDO";
  return "PENDIENTE";
};

export const crearPago = async (req, res) => {
  try {
    const {
      id_cliente,
      id_orden_trabajo,
      fecha_pago,
      metodo_pago,
      monto,
      referencia_pago,
      observaciones,
    } = req.body;

    if (!id_cliente) {
      return apiErrorText(res, req, 400, "El cliente es obligatorio", "Client is required");
    }

    if (!metodo_pago || !METODOS_PAGO_VALIDOS.includes(metodo_pago.toUpperCase())) {
      return apiErrorText(res, req, 400, "Método de pago inválido", "Invalid payment method");
    }

    if (monto === undefined || monto === null || Number(monto) <= 0) {
      return apiErrorText(res, req, 400, "El monto debe ser mayor a 0", "Amount must be greater than 0");
    }

    const clienteResult = await pool.query(
      `SELECT id_cliente, estado FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({ error: "El cliente no existe" });
    }

    if (clienteResult.rows[0].estado !== "ACTIVO") {
      return res.status(400).json({ error: "No se puede registrar pago a un cliente inactivo" });
    }

    if (id_orden_trabajo) {
      const ordenResult = await pool.query(
        `SELECT id_orden_trabajo, id_cliente FROM ordenes_trabajo WHERE id_orden_trabajo = $1`,
        [id_orden_trabajo]
      );

      if (ordenResult.rows.length === 0) {
        return res.status(404).json({ error: "La orden de trabajo no existe" });
      }

      if (Number(ordenResult.rows[0].id_cliente) !== Number(id_cliente)) {
        return res.status(400).json({ error: "La orden no pertenece al cliente seleccionado" });
      }
    }

    const registradoPor = req.user?.id_usuario || null;

    const query = `
      INSERT INTO pagos (
        id_cliente,
        id_orden_trabajo,
        fecha_pago,
        metodo_pago,
        monto,
        referencia_pago,
        observaciones,
        registrado_por
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *;
    `;

    const values = [
      id_cliente,
      id_orden_trabajo || null,
      fecha_pago || null,
      metodo_pago.toUpperCase(),
      Number(monto),
      referencia_pago?.trim() || null,
      observaciones?.trim() || null,
      registradoPor,
    ];

    const { rows } = await pool.query(query, values);
    const pago = rows[0];

    await registrarAuditoria({
      tabla_afectada: "pagos",
      id_registro: pago.id_pago,
      accion: "PAGO",
      descripcion: `Se registró un pago por ${formatCurrencyLabel(pago.monto)}`,
      valores_nuevos: pago,
      realizado_por: registradoPor,
    });

    return res.status(201).json(pago);
  } catch (error) {
    console.error("Error al crear pago:", error);
    return apiErrorText(res, req, 500, "Error interno al crear pago", "Internal error while creating payment");
  }
};

export const listarPagos = async (req, res) => {
  try {
    const { id_cliente, id_orden_trabajo, metodo_pago, fecha_desde, fecha_hasta } = req.query;
    const { page, limit, offset } = req.pagination || { page: 1, limit: 50, offset: 0 };

    let whereClause = ` WHERE 1=1 `;
    const values = [];
    let index = 1;

    if (id_cliente) {
      whereClause += ` AND p.id_cliente = $${index}`;
      values.push(id_cliente);
      index++;
    }

    if (id_orden_trabajo) {
      whereClause += ` AND p.id_orden_trabajo = $${index}`;
      values.push(id_orden_trabajo);
      index++;
    }

    if (metodo_pago) {
      whereClause += ` AND p.metodo_pago = $${index}`;
      values.push(metodo_pago.toUpperCase());
      index++;
    }

    if (fecha_desde) {
      whereClause += ` AND p.fecha_pago >= $${index}`;
      values.push(fecha_desde);
      index++;
    }

    if (fecha_hasta) {
      whereClause += ` AND p.fecha_pago <= $${index}`;
      values.push(fecha_hasta);
      index++;
    }

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM pagos p
        INNER JOIN clientes c ON p.id_cliente = c.id_cliente
        LEFT JOIN ordenes_trabajo ot ON p.id_orden_trabajo = ot.id_orden_trabajo
        LEFT JOIN usuarios u ON p.registrado_por = u.id_usuario
        ${whereClause}
      `,
      values
    );
    const total = countResult.rows[0].total;

    const dataQuery = `
      SELECT
        p.*,
        c.nombre_completo AS cliente,
        ot.numero_orden,
        u.nombre AS registrado_por_nombre
      FROM pagos p
      INNER JOIN clientes c
        ON p.id_cliente = c.id_cliente
      LEFT JOIN ordenes_trabajo ot
        ON p.id_orden_trabajo = ot.id_orden_trabajo
      LEFT JOIN usuarios u
        ON p.registrado_por = u.id_usuario
      ${whereClause}
      ORDER BY p.fecha_pago DESC, p.id_pago DESC
      LIMIT $${index} OFFSET $${index + 1}
    `;

    const { rows } = await pool.query(dataQuery, [...values, limit, offset]);

    return res.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error al listar pagos:", error);
    return apiErrorText(res, req, 500, "Error interno al listar pagos", "Internal error while listing payments");
  }
};

export const obtenerPagoPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        p.*,
        c.nombre_completo AS cliente,
        ot.numero_orden,
        u.nombre AS registrado_por_nombre
      FROM pagos p
      INNER JOIN clientes c
        ON p.id_cliente = c.id_cliente
      LEFT JOIN ordenes_trabajo ot
        ON p.id_orden_trabajo = ot.id_orden_trabajo
      LEFT JOIN usuarios u
        ON p.registrado_por = u.id_usuario
      WHERE p.id_pago = $1
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return apiErrorText(res, req, 404, "Pago no encontrado", "Payment not found");
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener pago:", error);
    return apiErrorText(res, req, 500, "Error interno al obtener pago", "Internal error while loading payment");
  }
};

export const crearCredito = async (req, res) => {
  try {
    const {
      id_cliente,
      id_orden_trabajo,
      monto_total,
      monto_pagado,
      dias_credito,
      fecha_inicio_credito,
      fecha_vencimiento,
      observaciones,
    } = req.body;

    if (!id_cliente) {
      return apiErrorText(res, req, 400, "El cliente es obligatorio", "Client is required");
    }

    if (!id_orden_trabajo) {
      return apiErrorText(res, req, 400, "La orden de trabajo es obligatoria", "Work order is required");
    }

    if (monto_total === undefined || monto_total === null || Number(monto_total) < 0) {
      return res.status(400).json({ error: "El monto total es obligatorio y no puede ser negativo" });
    }

    const montoPagadoFinal = monto_pagado === undefined || monto_pagado === null ? 0 : Number(monto_pagado);

    if (montoPagadoFinal < 0) {
      return res.status(400).json({ error: "El monto pagado no puede ser negativo" });
    }

    if (montoPagadoFinal > Number(monto_total)) {
      return res.status(400).json({ error: "El monto pagado no puede ser mayor al monto total" });
    }

    if (dias_credito !== undefined && dias_credito !== null && Number(dias_credito) < 0) {
      return res.status(400).json({ error: "Los días de crédito no pueden ser negativos" });
    }

    if (!fecha_vencimiento) {
      return res.status(400).json({ error: "La fecha de vencimiento es obligatoria" });
    }

    const clienteResult = await pool.query(
      `SELECT id_cliente, estado FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({ error: "El cliente no existe" });
    }

    if (clienteResult.rows[0].estado !== "ACTIVO") {
      return res.status(400).json({ error: "No se puede crear crédito a un cliente inactivo" });
    }

    const ordenResult = await pool.query(
      `SELECT id_orden_trabajo, id_cliente, total_orden FROM ordenes_trabajo WHERE id_orden_trabajo = $1`,
      [id_orden_trabajo]
    );

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({ error: "La orden de trabajo no existe" });
    }

    if (Number(ordenResult.rows[0].id_cliente) !== Number(id_cliente)) {
      return res.status(400).json({ error: "La orden no pertenece al cliente seleccionado" });
    }

    const saldoPendiente = Number(Number(monto_total) - montoPagadoFinal).toFixed(2);
    const estadoCredito = recalcularEstadoCredito(
      Number(monto_total),
      montoPagadoFinal,
      fecha_vencimiento
    );

    const query = `
      INSERT INTO creditos (
        id_cliente,
        id_orden_trabajo,
        monto_total,
        monto_pagado,
        saldo_pendiente,
        dias_credito,
        fecha_inicio_credito,
        fecha_vencimiento,
        estado,
        observaciones
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *;
    `;

    const values = [
      id_cliente,
      id_orden_trabajo,
      Number(monto_total),
      montoPagadoFinal,
      Number(saldoPendiente),
      dias_credito ?? 0,
      fecha_inicio_credito || null,
      fecha_vencimiento,
      estadoCredito,
      observaciones?.trim() || null,
    ];

    const { rows } = await pool.query(query, values);
    const credito = rows[0];

    await registrarAuditoria({
      tabla_afectada: "creditos",
      id_registro: credito.id_credito,
      accion: "CREAR",
      descripcion: `Se creó un crédito para la orden ${credito.id_orden_trabajo}`,
      valores_nuevos: credito,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.status(201).json(credito);
  } catch (error) {
    console.error("Error al crear crédito:", error);
    return apiErrorText(res, req, 500, "Error interno al crear crédito", "Internal error while creating credit");
  }
};

export const listarCreditos = async (req, res) => {
  try {
    const { estado, id_cliente, id_orden_trabajo, fecha_desde, fecha_hasta } = req.query;
    const { page, limit, offset } = req.pagination || { page: 1, limit: 50, offset: 0 };

    let whereClause = ` WHERE 1=1 `;
    const values = [];
    let index = 1;

    if (estado) {
      whereClause += ` AND cr.estado = $${index}`;
      values.push(estado.toUpperCase());
      index++;
    }

    if (id_cliente) {
      whereClause += ` AND cr.id_cliente = $${index}`;
      values.push(id_cliente);
      index++;
    }

    if (id_orden_trabajo) {
      whereClause += ` AND cr.id_orden_trabajo = $${index}`;
      values.push(id_orden_trabajo);
      index++;
    }

    if (fecha_desde) {
      whereClause += ` AND cr.fecha_vencimiento >= $${index}`;
      values.push(fecha_desde);
      index++;
    }

    if (fecha_hasta) {
      whereClause += ` AND cr.fecha_vencimiento <= $${index}`;
      values.push(fecha_hasta);
      index++;
    }

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM creditos cr
        INNER JOIN clientes c ON cr.id_cliente = c.id_cliente
        INNER JOIN ordenes_trabajo ot ON cr.id_orden_trabajo = ot.id_orden_trabajo
        ${whereClause}
      `,
      values
    );
    const total = countResult.rows[0].total;

    const dataQuery = `
      SELECT
        cr.*,
        c.nombre_completo AS cliente,
        ot.numero_orden
      FROM creditos cr
      INNER JOIN clientes c
        ON cr.id_cliente = c.id_cliente
      INNER JOIN ordenes_trabajo ot
        ON cr.id_orden_trabajo = ot.id_orden_trabajo
      ${whereClause}
      ORDER BY cr.fecha_vencimiento ASC, cr.id_credito DESC
      LIMIT $${index} OFFSET $${index + 1}
    `;

    const { rows } = await pool.query(dataQuery, [...values, limit, offset]);

    return res.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error al listar créditos:", error);
    return apiErrorText(res, req, 500, "Error interno al listar créditos", "Internal error while listing credits");
  }
};

export const obtenerResumenCobranza = async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, estado, id_cliente } = req.query;
    const solo_vencidos = parseBooleanQuery(req.query.solo_vencidos);
    const solo_parciales = parseBooleanQuery(req.query.solo_parciales);
    const [tieneSeguimientosCobranza, tieneResponsableSeguimientoCobranza] = await Promise.all([
      soportaSeguimientosCobranza(),
      soportaResponsableSeguimientoCobranza(),
    ]);

    if (id_cliente && !/^\d+$/.test(String(id_cliente))) {
      return apiErrorText(res, req, 400, "El cliente es inválido", "Client is invalid");
    }

    if (estado && !ESTADOS_CREDITO_VALIDOS.includes(estado.toUpperCase())) {
      return apiErrorText(res, req, 400, "Estado de crédito inválido", "Invalid credit status");
    }

    const creditoFilters = buildCobranzaCreditoFilters({
      estado,
      id_cliente,
      solo_vencidos,
      solo_parciales,
    });

    const creditosQuery = `
      SELECT
        cr.id_credito,
        cr.id_cliente,
        c.nombre_completo AS cliente,
        cr.id_orden_trabajo,
        ot.numero_orden,
        cr.estado,
        cr.fecha_vencimiento,
        COALESCE(cr.monto_total, 0)::numeric AS monto_total,
        COALESCE(cr.monto_pagado, 0)::numeric AS monto_pagado,
        COALESCE(cr.saldo_pendiente, 0)::numeric AS saldo_pendiente,
        CASE
          WHEN cr.fecha_vencimiento < CURRENT_DATE AND COALESCE(cr.saldo_pendiente, 0) > 0
            THEN (CURRENT_DATE - cr.fecha_vencimiento)::int
          ELSE 0
        END AS dias_vencido,
        ultimo_pago.ultimo_pago_fecha,
        ultimo_pago.ultimo_pago_monto,
        ${
          tieneSeguimientosCobranza
            ? `ultimo_seguimiento.id_seguimiento,
        ultimo_seguimiento.fecha_seguimiento AS ultimo_seguimiento_fecha,
        ultimo_seguimiento.medio_contacto AS ultimo_seguimiento_medio,
        ultimo_seguimiento.resultado AS ultimo_seguimiento_resultado,
        ultimo_seguimiento.proximo_contacto,
        ultimo_seguimiento.notas AS ultima_nota_seguimiento,
        ${
          tieneResponsableSeguimientoCobranza
            ? `ultimo_seguimiento.id_usuario_responsable,
        ultimo_seguimiento.usuario_responsable`
            : `NULL::bigint AS id_usuario_responsable,
        NULL::varchar AS usuario_responsable`
        }`
            : `NULL::bigint AS id_seguimiento,
        NULL::date AS ultimo_seguimiento_fecha,
        NULL::varchar AS ultimo_seguimiento_medio,
        NULL::varchar AS ultimo_seguimiento_resultado,
        NULL::date AS proximo_contacto,
        NULL::text AS ultima_nota_seguimiento,
        NULL::bigint AS id_usuario_responsable,
        NULL::varchar AS usuario_responsable`
        }
      FROM creditos cr
      INNER JOIN clientes c
        ON cr.id_cliente = c.id_cliente
      INNER JOIN ordenes_trabajo ot
        ON cr.id_orden_trabajo = ot.id_orden_trabajo
      LEFT JOIN LATERAL (
        SELECT
          p.fecha_pago AS ultimo_pago_fecha,
          pc.monto_aplicado AS ultimo_pago_monto
        FROM pagos_credito pc
        INNER JOIN pagos p
          ON pc.id_pago = p.id_pago
        WHERE pc.id_credito = cr.id_credito
        ORDER BY p.fecha_pago DESC NULLS LAST, pc.id_pago_credito DESC
        LIMIT 1
      ) ultimo_pago ON TRUE
      ${
        tieneSeguimientosCobranza
          ? `
      LEFT JOIN LATERAL (
        SELECT
          cs.id_seguimiento,
          cs.fecha_seguimiento,
          cs.medio_contacto,
          cs.resultado,
          cs.proximo_contacto,
          cs.notas,
          ${
            tieneResponsableSeguimientoCobranza
              ? `cs.id_usuario_responsable,
          COALESCE(ur.nombre, ur.username, ur.correo) AS usuario_responsable`
              : `NULL::bigint AS id_usuario_responsable,
          NULL::varchar AS usuario_responsable`
          }
        FROM cobranza_seguimientos cs
        ${
          tieneResponsableSeguimientoCobranza
            ? `LEFT JOIN usuarios ur
          ON cs.id_usuario_responsable = ur.id_usuario`
            : ""
        }
        WHERE cs.id_credito = cr.id_credito
           OR (cs.id_credito IS NULL AND cs.id_cliente = cr.id_cliente)
        ORDER BY cs.fecha_seguimiento DESC, cs.id_seguimiento DESC
        LIMIT 1
      ) ultimo_seguimiento ON TRUE
      `
          : ""
      }
      ${creditoFilters.whereClause}
      ORDER BY
        CASE
          WHEN cr.fecha_vencimiento < CURRENT_DATE AND COALESCE(cr.saldo_pendiente, 0) > 0
            THEN (CURRENT_DATE - cr.fecha_vencimiento)::int
          ELSE 0
        END DESC,
        cr.fecha_vencimiento ASC,
        cr.id_credito DESC
    `;

    const pagosFilters = buildCobranzaPagoFilters({
      fecha_desde,
      fecha_hasta,
      id_cliente,
    });

    const pagosQuery = `
      SELECT COALESCE(SUM(p.monto), 0)::numeric AS pagos_cobrados_rango
      FROM pagos p
      ${pagosFilters.whereClause}
    `;

    const [creditosResult, pagosResult] = await Promise.all([
      pool.query(creditosQuery, creditoFilters.values),
      pool.query(pagosQuery, pagosFilters.values),
    ]);

    const clientes = creditosResult.rows.map((row) => ({
      ...row,
      monto_total: roundMoney(row.monto_total),
      monto_pagado: roundMoney(row.monto_pagado),
      saldo_pendiente: roundMoney(row.saldo_pendiente),
      dias_vencido: Number(row.dias_vencido || 0),
      ultimo_pago_monto:
        row.ultimo_pago_monto === null ? null : roundMoney(row.ultimo_pago_monto),
      id_seguimiento: row.id_seguimiento ? Number(row.id_seguimiento) : null,
      id_usuario_responsable: row.id_usuario_responsable
        ? Number(row.id_usuario_responsable)
        : null,
    }));

    const initialBucket = () => ({ count: 0, saldo_pendiente: 0 });
    const buckets = {
      al_dia: initialBucket(),
      vence_1_7: initialBucket(),
      vence_8_30: initialBucket(),
      vence_31_mas: initialBucket(),
    };

    clientes.forEach((row) => {
      let bucketKey = "al_dia";
      if (row.dias_vencido >= 31) {
        bucketKey = "vence_31_mas";
      } else if (row.dias_vencido >= 8) {
        bucketKey = "vence_8_30";
      } else if (row.dias_vencido >= 1) {
        bucketKey = "vence_1_7";
      }

      buckets[bucketKey].count += 1;
      buckets[bucketKey].saldo_pendiente = roundMoney(
        buckets[bucketKey].saldo_pendiente + row.saldo_pendiente
      );
    });

    const resumen = {
      saldo_pendiente_total: roundMoney(
        clientes.reduce((sum, row) => sum + Number(row.saldo_pendiente || 0), 0)
      ),
      creditos_vencidos: clientes.filter((row) => row.dias_vencido > 0).length,
      creditos_parciales: clientes.filter((row) => row.estado === "PARCIAL").length,
      pagos_cobrados_rango: roundMoney(pagosResult.rows[0]?.pagos_cobrados_rango || 0),
      clientes_con_saldo: new Set(
        clientes
          .filter((row) => Number(row.saldo_pendiente || 0) > 0)
          .map((row) => String(row.id_cliente))
      ).size,
    };

    const reporte = {
      generado_en: new Date().toISOString(),
      filtros: {
        fecha_desde: fecha_desde || null,
        fecha_hasta: fecha_hasta || null,
        estado: estado?.toUpperCase() || null,
        id_cliente: id_cliente ? Number(id_cliente) : null,
        solo_vencidos,
        solo_parciales,
      },
      resumen,
      buckets,
      clientes,
    };

    return res.json({
      resumen,
      buckets,
      clientes,
      reporte,
    });
  } catch (error) {
    console.error("Error al obtener resumen de cobranza:", error);
    return apiErrorText(
      res,
      req,
      500,
      "Error interno al obtener cobranza",
      "Internal error while loading collections"
    );
  }
};

export const obtenerCreditoPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const creditoQuery = `
      SELECT
        cr.*,
        c.nombre_completo AS cliente,
        ot.numero_orden
      FROM creditos cr
      INNER JOIN clientes c
        ON cr.id_cliente = c.id_cliente
      INNER JOIN ordenes_trabajo ot
        ON cr.id_orden_trabajo = ot.id_orden_trabajo
      WHERE cr.id_credito = $1
    `;

    const creditoResult = await pool.query(creditoQuery, [id]);

    if (creditoResult.rows.length === 0) {
      return apiErrorText(res, req, 404, "Crédito no encontrado", "Credit not found");
    }

    const pagosQuery = `
      SELECT
        pc.*,
        p.fecha_pago,
        p.metodo_pago,
        p.referencia_pago,
        p.observaciones,
        p.monto AS monto_pago
      FROM pagos_credito pc
      INNER JOIN pagos p
        ON pc.id_pago = p.id_pago
      WHERE pc.id_credito = $1
      ORDER BY pc.id_pago_credito DESC
    `;

    const pagosResult = await pool.query(pagosQuery, [id]);

    return res.json({
      ...creditoResult.rows[0],
      pagos_aplicados: pagosResult.rows,
    });
  } catch (error) {
    console.error("Error al obtener crédito:", error);
    return res.status(500).json({ error: "Error interno al obtener crédito" });
  }
};

export const cambiarEstadoCredito = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !ESTADOS_CREDITO_VALIDOS.includes(estado.toUpperCase())) {
      return apiErrorText(res, req, 400, "Estado de crédito inválido", "Invalid credit status");
    }

    const anteriorResult = await pool.query(
      `SELECT * FROM creditos WHERE id_credito = $1`,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return apiErrorText(res, req, 404, "Crédito no encontrado", "Credit not found");
    }

    const anterior = anteriorResult.rows[0];
    const esCancelacion = estado.toUpperCase() === "CANCELADO";

    const query = `
      UPDATE creditos
      SET estado = $1,
          updated_by = $2,
          updated_at = NOW(),
          cancelado_por = CASE WHEN $1 = 'CANCELADO' THEN $2 ELSE cancelado_por END,
          cancelado_en = CASE WHEN $1 = 'CANCELADO' THEN NOW() ELSE cancelado_en END
      WHERE id_credito = $3
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      estado.toUpperCase(),
      req.user?.id_usuario || null,
      id,
    ]);

    if (rows.length === 0) {
      return apiErrorText(res, req, 404, "Crédito no encontrado", "Credit not found");
    }

    const credito = rows[0];

    await registrarAuditoria({
      tabla_afectada: "creditos",
      id_registro: credito.id_credito,
      accion: esCancelacion ? "CANCELAR" : "CAMBIAR_ESTADO",
      descripcion: esCancelacion
        ? `Se canceló el crédito ${credito.id_credito}`
        : `Se cambió el estado del crédito ${credito.id_credito} a ${credito.estado}`,
      valores_anteriores: anterior,
      valores_nuevos: credito,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(credito);
  } catch (error) {
    console.error("Error al cambiar estado del crédito:", error);
    return res.status(500).json({ error: "Error interno al cambiar estado del crédito" });
  }
};

export const aplicarPagoACredito = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      id_credito,
      fecha_pago,
      metodo_pago,
      monto,
      referencia_pago,
      observaciones,
    } = req.body;

    if (!id_credito) {
      await client.query("ROLLBACK");
      return apiErrorText(res, req, 400, "El crédito es obligatorio", "Credit is required");
    }

    if (!metodo_pago || !METODOS_PAGO_VALIDOS.includes(metodo_pago.toUpperCase())) {
      await client.query("ROLLBACK");
      return apiErrorText(res, req, 400, "Método de pago inválido", "Invalid payment method");
    }

    if (monto === undefined || monto === null || Number(monto) <= 0) {
      await client.query("ROLLBACK");
      return apiErrorText(res, req, 400, "El monto debe ser mayor a 0", "Amount must be greater than 0");
    }

    // FOR UPDATE bloquea la fila hasta el COMMIT. Sin esto, dos abonos
    // concurrentes leerían el mismo saldo, ambos pasarían la validación
    // y ambos se commitearían — doble cobro registrado, saldo decrementado
    // una sola vez. El lock serializa abonos al mismo crédito.
    const creditoResult = await client.query(
      `SELECT *
       FROM creditos
       WHERE id_credito = $1
       FOR UPDATE`,
      [id_credito]
    );

    if (creditoResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "El crédito no existe" });
    }

    const credito = creditoResult.rows[0];

    if (credito.estado === "PAGADO") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El crédito ya está pagado" });
    }

    if (credito.estado === "CANCELADO") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No se puede pagar un crédito cancelado" });
    }

    const montoFinal = Number(monto);
    const saldoActual = Number(credito.saldo_pendiente);

    if (montoFinal > saldoActual) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El monto excede el saldo pendiente del crédito" });
    }

    const registradoPor = req.user?.id_usuario || null;

    const pagoResult = await client.query(
      `
        INSERT INTO pagos (
          id_cliente,
          id_orden_trabajo,
          fecha_pago,
          metodo_pago,
          monto,
          referencia_pago,
          observaciones,
          registrado_por
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *;
      `,
      [
        credito.id_cliente,
        credito.id_orden_trabajo,
        fecha_pago || null,
        metodo_pago.toUpperCase(),
        montoFinal,
        referencia_pago?.trim() || null,
        observaciones?.trim() || null,
        registradoPor,
      ]
    );

    const pago = pagoResult.rows[0];

    await registrarAuditoria({
      client,
      tabla_afectada: "pagos",
      id_registro: pago.id_pago,
      accion: "PAGO",
      descripcion: `Se registró un pago aplicado a crédito por ${formatCurrencyLabel(pago.monto)}`,
      valores_nuevos: pago,
      realizado_por: registradoPor,
    });

    const pagoCreditoResult = await client.query(
      `
        INSERT INTO pagos_credito (
          id_pago,
          id_credito,
          monto_aplicado
        )
        VALUES ($1,$2,$3)
        RETURNING id_pago_credito
      `,
      [pago.id_pago, id_credito, montoFinal]
    );
    const id_pago_credito = pagoCreditoResult.rows[0].id_pago_credito;

    const nuevoMontoPagado = Number(credito.monto_pagado) + montoFinal;
    const nuevoSaldo = Number((Number(credito.monto_total) - nuevoMontoPagado).toFixed(2));
    const nuevoEstado = recalcularEstadoCredito(
      Number(credito.monto_total),
      nuevoMontoPagado,
      credito.fecha_vencimiento
    );

    const creditoActualizadoResult = await client.query(
      `
        UPDATE creditos
        SET monto_pagado = $1,
            saldo_pendiente = $2,
            estado = $3,
            updated_at = NOW()
        WHERE id_credito = $4
        RETURNING *;
      `,
      [nuevoMontoPagado, nuevoSaldo < 0 ? 0 : nuevoSaldo, nuevoEstado, id_credito]
    );

    const creditoActualizado = creditoActualizadoResult.rows[0];

    await registrarAuditoria({
      client,
      tabla_afectada: "creditos",
      id_registro: creditoActualizado.id_credito,
      accion: "ABONO",
      descripcion: `Se aplicó un abono de ${formatCurrencyLabel(montoFinal)} al crédito ${creditoActualizado.id_credito}`,
      valores_anteriores: credito,
      valores_nuevos: creditoActualizado,
      realizado_por: registradoPor,
    });

    await client.query("COMMIT");

    return res.status(201).json({
      pago,
      credito_actualizado: creditoActualizado,
      id_pago_credito,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al aplicar pago a crédito:", error);
    return apiErrorText(res, req, 500, "Error interno al aplicar pago a crédito", "Internal error while applying payment to credit");
  } finally {
    client.release();
  }
};

export const listarSeguimientosCobranzaCliente = async (req, res) => {
  try {
    const { id_cliente } = req.params;
    const [soportaSeguimientos, soportaResponsableSeguimiento] = await Promise.all([
      soportaSeguimientosCobranza(),
      soportaResponsableSeguimientoCobranza(),
    ]);

    if (!soportaSeguimientos) {
      return res.json([]);
    }

    const clienteResult = await pool.query(
      `SELECT id_cliente FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (clienteResult.rows.length === 0) {
      return apiErrorText(res, req, 404, "Cliente no encontrado", "Client not found");
    }

    const query = `
      SELECT
        cs.*,
        c.nombre_completo AS cliente,
        ${
          soportaResponsableSeguimiento
            ? `COALESCE(ur.nombre, ur.username, ur.correo) AS usuario_responsable`
            : `NULL::varchar AS usuario_responsable`
        },
        ot.numero_orden
      FROM cobranza_seguimientos cs
      INNER JOIN clientes c
        ON cs.id_cliente = c.id_cliente
      ${
        soportaResponsableSeguimiento
          ? `LEFT JOIN usuarios ur
        ON cs.id_usuario_responsable = ur.id_usuario`
          : ""
      }
      LEFT JOIN creditos cr
        ON cs.id_credito = cr.id_credito
      LEFT JOIN ordenes_trabajo ot
        ON cr.id_orden_trabajo = ot.id_orden_trabajo
      WHERE cs.id_cliente = $1
      ORDER BY cs.fecha_seguimiento DESC, cs.id_seguimiento DESC
    `;

    const result = await pool.query(query, [id_cliente]);
    return res.json(result.rows);
  } catch (error) {
    console.error("Error al listar seguimientos de cobranza:", error);
    return apiErrorText(
      res,
      req,
      500,
      "Error interno al listar seguimientos de cobranza",
      "Internal error while listing collection follow-ups"
    );
  }
};

export const crearSeguimientoCobranza = async (req, res) => {
  try {
    const [soportaSeguimientos, soportaResponsableSeguimiento] = await Promise.all([
      soportaSeguimientosCobranza(),
      soportaResponsableSeguimientoCobranza(),
    ]);

    if (!soportaSeguimientos) {
      return apiErrorText(
        res,
        req,
        400,
        "Debes correr las migraciones de cobranza antes de registrar seguimientos",
        "You must run collections migrations before registering follow-ups"
      );
    }

    const {
      id_cliente,
      id_credito,
      fecha_seguimiento,
      medio_contacto,
      resultado,
      proximo_contacto,
      notas,
      id_usuario_responsable,
    } = req.body;

    if (!id_cliente) {
      return apiErrorText(res, req, 400, "El cliente es obligatorio", "Client is required");
    }

    if (!notas?.trim()) {
      return apiErrorText(res, req, 400, "Las notas son obligatorias", "Notes are required");
    }

    if (
      !medio_contacto ||
      !MEDIOS_SEGUIMIENTO_VALIDOS.includes(String(medio_contacto).toUpperCase())
    ) {
      return apiErrorText(
        res,
        req,
        400,
        "Medio de contacto invalido",
        "Invalid contact method"
      );
    }

    if (!resultado || !RESULTADOS_SEGUIMIENTO_VALIDOS.includes(String(resultado).toUpperCase())) {
      return apiErrorText(
        res,
        req,
        400,
        "Resultado de seguimiento invalido",
        "Invalid follow-up result"
      );
    }

    let usuarioResponsable = null;
    if (soportaResponsableSeguimiento) {
      if (!id_usuario_responsable) {
        return apiErrorText(
          res,
          req,
          400,
          "Debes asignar un responsable interno",
          "You must assign an internal owner"
        );
      }

      const responsableResult = await pool.query(
        `
          SELECT id_usuario, nombre, username, correo, estado
          FROM usuarios
          WHERE id_usuario = $1
        `,
        [id_usuario_responsable]
      );

      if (responsableResult.rows.length === 0) {
        return apiErrorText(
          res,
          req,
          404,
          "Responsable no encontrado",
          "Owner not found"
        );
      }

      usuarioResponsable = responsableResult.rows[0];
      if (usuarioResponsable.estado !== "ACTIVO") {
        return apiErrorText(
          res,
          req,
          400,
          "El responsable debe estar activo",
          "The owner must be active"
        );
      }
    }

    const clienteResult = await pool.query(
      `SELECT id_cliente, nombre_completo FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (clienteResult.rows.length === 0) {
      return apiErrorText(res, req, 404, "Cliente no encontrado", "Client not found");
    }

    let credito = null;
    if (id_credito) {
      const creditoResult = await pool.query(
        `
          SELECT
            cr.id_credito,
            cr.id_cliente
          FROM creditos cr
          WHERE cr.id_credito = $1
        `,
        [id_credito]
      );

      if (creditoResult.rows.length === 0) {
        return apiErrorText(res, req, 404, "Credito no encontrado", "Credit not found");
      }

      credito = creditoResult.rows[0];
      if (Number(credito.id_cliente) !== Number(id_cliente)) {
        return apiErrorText(
          res,
          req,
          400,
          "El credito no pertenece al cliente seleccionado",
          "The credit does not belong to the selected client"
        );
      }
    }

    const values = [
      Number(id_cliente),
      id_credito ? Number(id_credito) : null,
      fecha_seguimiento || null,
      String(medio_contacto).toUpperCase(),
      String(resultado).toUpperCase(),
      proximo_contacto || null,
      notas.trim(),
      req.user?.id_usuario || null,
      req.user?.id_usuario || null,
    ];

    const insertQuery = soportaResponsableSeguimiento
      ? `
        INSERT INTO cobranza_seguimientos (
          id_cliente,
          id_credito,
          fecha_seguimiento,
          medio_contacto,
          resultado,
          proximo_contacto,
          notas,
          id_usuario_responsable,
          created_by,
          updated_by
        )
        VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
      `
      : `
        INSERT INTO cobranza_seguimientos (
          id_cliente,
          id_credito,
          fecha_seguimiento,
          medio_contacto,
          resultado,
          proximo_contacto,
          notas,
          created_by,
          updated_by
        )
        VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4,$5,$6,$7,$8,$9)
        RETURNING *
      `;

    const insertValues = soportaResponsableSeguimiento
      ? [...values.slice(0, 7), Number(id_usuario_responsable), ...values.slice(7)]
      : values;

    const result = await pool.query(insertQuery, insertValues);

    const seguimiento = result.rows[0];
    const cliente = clienteResult.rows[0];
    if (usuarioResponsable) {
      seguimiento.usuario_responsable =
        usuarioResponsable.nombre || usuarioResponsable.username || usuarioResponsable.correo;
    }
    const descripcionResponsable = usuarioResponsable
      ? ` con responsable ${
          usuarioResponsable.nombre || usuarioResponsable.username || usuarioResponsable.correo
        }`
      : "";

    await registrarAuditoria({
      tabla_afectada: "cobranza_seguimientos",
      id_registro: seguimiento.id_seguimiento,
      accion: "SEGUIMIENTO",
      descripcion: buildSeguimientoDescription({
        cliente: cliente.nombre_completo,
        medio_contacto: seguimiento.medio_contacto,
        resultado: seguimiento.resultado,
        fecha_seguimiento: seguimiento.fecha_seguimiento,
      }) + descripcionResponsable,
      valores_nuevos: seguimiento,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.status(201).json(seguimiento);
  } catch (error) {
    console.error("Error al crear seguimiento de cobranza:", error);
    return apiErrorText(
      res,
      req,
      500,
      "Error interno al crear seguimiento de cobranza",
      "Internal error while creating collection follow-up"
    );
  }
};
