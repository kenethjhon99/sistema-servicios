import { pool } from "../config/db.js";
import { registrarAuditoria } from "../utils/auditoria.js";

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
      registrado_por,
    } = req.body;

    if (!id_cliente) {
      return res.status(400).json({ error: "El cliente es obligatorio" });
    }

    if (!metodo_pago || !METODOS_PAGO_VALIDOS.includes(metodo_pago.toUpperCase())) {
      return res.status(400).json({ error: "Método de pago inválido" });
    }

    if (monto === undefined || monto === null || Number(monto) <= 0) {
      return res.status(400).json({ error: "El monto debe ser mayor a 0" });
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

    if (registrado_por) {
      const usuarioResult = await pool.query(
        `SELECT id_usuario, estado FROM usuarios WHERE id_usuario = $1`,
        [registrado_por]
      );

      if (usuarioResult.rows.length === 0) {
        return res.status(404).json({ error: "El usuario que registra el pago no existe" });
      }

      if (usuarioResult.rows[0].estado !== "ACTIVO") {
        return res.status(400).json({ error: "El usuario que registra el pago está inactivo" });
      }
    }

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
const pago = rows[0];

await registrarAuditoria({
  tabla_afectada: "pagos",
  id_registro: pago.id_pago,
  accion: "PAGO",
  descripcion: `Se registró un pago por Q${pago.monto}`,
  valores_nuevos: pago,
  realizado_por: req.user?.id_usuario || pago.registrado_por || null,
});
    const values = [
      id_cliente,
      id_orden_trabajo || null,
      fecha_pago || null,
      metodo_pago.toUpperCase(),
      Number(monto),
      referencia_pago?.trim() || null,
      observaciones?.trim() || null,
      registrado_por || null,
    ];

    const { rows } = await pool.query(query, values);
    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al crear pago:", error);
    return res.status(500).json({ error: "Error interno al crear pago" });
  }
};

export const listarPagos = async (req, res) => {
  try {
    const { id_cliente, id_orden_trabajo, metodo_pago, fecha_desde, fecha_hasta } = req.query;

    let query = `
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
      WHERE 1=1
    `;

    const values = [];
    let index = 1;

    if (id_cliente) {
      query += ` AND p.id_cliente = $${index}`;
      values.push(id_cliente);
      index++;
    }

    if (id_orden_trabajo) {
      query += ` AND p.id_orden_trabajo = $${index}`;
      values.push(id_orden_trabajo);
      index++;
    }

    if (metodo_pago) {
      query += ` AND p.metodo_pago = $${index}`;
      values.push(metodo_pago.toUpperCase());
      index++;
    }

    if (fecha_desde) {
      query += ` AND p.fecha_pago >= $${index}`;
      values.push(fecha_desde);
      index++;
    }

    if (fecha_hasta) {
      query += ` AND p.fecha_pago <= $${index}`;
      values.push(fecha_hasta);
      index++;
    }

    query += ` ORDER BY p.fecha_pago DESC, p.id_pago DESC`;

    const { rows } = await pool.query(query, values);
    return res.json(rows);
  } catch (error) {
    console.error("Error al listar pagos:", error);
    return res.status(500).json({ error: "Error interno al listar pagos" });
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
      return res.status(404).json({ error: "Pago no encontrado" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener pago:", error);
    return res.status(500).json({ error: "Error interno al obtener pago" });
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
      return res.status(400).json({ error: "El cliente es obligatorio" });
    }

    if (!id_orden_trabajo) {
      return res.status(400).json({ error: "La orden de trabajo es obligatoria" });
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
    const credito = rows[0];

await registrarAuditoria({
  tabla_afectada: "creditos",
  id_registro: credito.id_credito,
  accion: "CREAR",
  descripcion: `Se creó un crédito para la orden ${credito.id_orden_trabajo}`,
  valores_nuevos: credito,
  realizado_por: req.user?.id_usuario || null,
});

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
    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al crear crédito:", error);
    return res.status(500).json({ error: "Error interno al crear crédito" });
  }
};

export const listarCreditos = async (req, res) => {
  try {
    const { estado, id_cliente, id_orden_trabajo, fecha_desde, fecha_hasta } = req.query;

    let query = `
      SELECT
        cr.*,
        c.nombre_completo AS cliente,
        ot.numero_orden
      FROM creditos cr
      INNER JOIN clientes c
        ON cr.id_cliente = c.id_cliente
      INNER JOIN ordenes_trabajo ot
        ON cr.id_orden_trabajo = ot.id_orden_trabajo
      WHERE 1=1
    `;

    const values = [];
    let index = 1;

    if (estado) {
      query += ` AND cr.estado = $${index}`;
      values.push(estado.toUpperCase());
      index++;
    }

    if (id_cliente) {
      query += ` AND cr.id_cliente = $${index}`;
      values.push(id_cliente);
      index++;
    }

    if (id_orden_trabajo) {
      query += ` AND cr.id_orden_trabajo = $${index}`;
      values.push(id_orden_trabajo);
      index++;
    }

    if (fecha_desde) {
      query += ` AND cr.fecha_vencimiento >= $${index}`;
      values.push(fecha_desde);
      index++;
    }

    if (fecha_hasta) {
      query += ` AND cr.fecha_vencimiento <= $${index}`;
      values.push(fecha_hasta);
      index++;
    }

    query += ` ORDER BY cr.fecha_vencimiento ASC, cr.id_credito DESC`;

    const { rows } = await pool.query(query, values);
    return res.json(rows);
  } catch (error) {
    console.error("Error al listar créditos:", error);
    return res.status(500).json({ error: "Error interno al listar créditos" });
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
      return res.status(404).json({ error: "Crédito no encontrado" });
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
      return res.status(400).json({ error: "Estado de crédito inválido" });
    }

    const anteriorResult = await pool.query(
  `SELECT * FROM creditos WHERE id_credito = $1`,
  [id]
);

if (anteriorResult.rows.length === 0) {
  return res.status(404).json({ error: "Crédito no encontrado" });
}

const anterior = anteriorResult.rows[0];

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

const credito = rows[0];
const esCancelacion = estado.toUpperCase() === "CANCELADO";

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

    const { rows } = await pool.query(query, [estado.toUpperCase(), id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Crédito no encontrado" });
    }

    return res.json(rows[0]);
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
      registrado_por,
    } = req.body;

    if (!id_credito) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El crédito es obligatorio" });
    }

    if (!metodo_pago || !METODOS_PAGO_VALIDOS.includes(metodo_pago.toUpperCase())) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Método de pago inválido" });
    }

    if (monto === undefined || monto === null || Number(monto) <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El monto debe ser mayor a 0" });
    }

    const creditoResult = await client.query(
      `SELECT *
       FROM creditos
       WHERE id_credito = $1`,
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

    if (registrado_por) {
      const usuarioResult = await client.query(
        `SELECT id_usuario, estado FROM usuarios WHERE id_usuario = $1`,
        [registrado_por]
      );

      if (usuarioResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "El usuario que registra el pago no existe" });
      }

      if (usuarioResult.rows[0].estado !== "ACTIVO") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "El usuario que registra el pago está inactivo" });
      }
    }

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
        registrado_por || null,
      ]
    );

    await registrarAuditoria({
  client,
  tabla_afectada: "pagos",
  id_registro: pago.id_pago,
  accion: "PAGO",
  descripcion: `Se registró un pago aplicado a crédito por Q${pago.monto}`,
  valores_nuevos: pago,
  realizado_por: req.user?.id_usuario || pago.registrado_por || null,
});

    const pago = pagoResult.rows[0];

    await client.query(
      `
        INSERT INTO pagos_credito (
          id_pago,
          id_credito,
          monto_aplicado
        )
        VALUES ($1,$2,$3)
      `,
      [pago.id_pago, id_credito, montoFinal]
    );

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
  descripcion: `Se aplicó un abono de Q${montoFinal} al crédito ${creditoActualizado.id_credito}`,
  valores_anteriores: credito,
  valores_nuevos: creditoActualizado,
  realizado_por: req.user?.id_usuario || pago.registrado_por || null,
});
    await client.query("COMMIT");

    return res.status(201).json({
      pago,
      credito_actualizado: creditoActualizadoResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al aplicar pago a crédito:", error);
    return res.status(500).json({ error: "Error interno al aplicar pago a crédito" });
  } finally {
    client.release();
  }
};