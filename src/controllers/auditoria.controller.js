import { pool } from "../config/db.js";

const ACCIONES_VALIDAS = [
  "CREAR",
  "ACTUALIZAR",
  "CAMBIAR_ESTADO",
  "CANCELAR",
  "CONVERTIR",
  "LOGIN",
  "RESET_PASSWORD",
  "PAGO",
  "ABONO",
];

const TABLAS_VALIDAS = [
  "usuarios",
  "clientes",
  "propiedades",
  "categorias_servicio",
  "servicios",
  "programaciones_servicio",
  "ordenes_trabajo",
  "ordenes_trabajo_detalle",
  "evidencias_orden",
  "pagos",
  "creditos",
  "pagos_credito",
  "cotizaciones",
  "cotizaciones_detalle",
  "insumos",
  "movimientos_insumo",
  "ordenes_insumos",
  "alertas",
];

export const listarAuditorias = async (req, res) => {
  try {
    const {
      tabla_afectada,
      accion,
      realizado_por,
      fecha_desde,
      fecha_hasta,
      q,
    } = req.query;
    const { page, limit, offset } = req.pagination || { page: 1, limit: 50, offset: 0 };

    let whereClause = ` WHERE 1=1 `;
    const values = [];
    let index = 1;

    if (tabla_afectada) {
      if (!TABLAS_VALIDAS.includes(tabla_afectada)) {
        return res.status(400).json({ error: "tabla_afectada inválida" });
      }

      whereClause += ` AND a.tabla_afectada = $${index}`;
      values.push(tabla_afectada);
      index++;
    }

    if (accion) {
      const accionUpper = accion.toUpperCase();

      if (!ACCIONES_VALIDAS.includes(accionUpper)) {
        return res.status(400).json({ error: "acción inválida" });
      }

      whereClause += ` AND a.accion = $${index}`;
      values.push(accionUpper);
      index++;
    }

    if (realizado_por) {
      whereClause += ` AND a.realizado_por = $${index}`;
      values.push(realizado_por);
      index++;
    }

    if (fecha_desde) {
      whereClause += ` AND a.fecha_evento >= $${index}`;
      values.push(fecha_desde);
      index++;
    }

    if (fecha_hasta) {
      whereClause += ` AND a.fecha_evento <= $${index}`;
      values.push(fecha_hasta);
      index++;
    }

    if (q) {
      whereClause += ` AND (
        a.descripcion ILIKE $${index}
        OR a.tabla_afectada ILIKE $${index}
        OR a.accion ILIKE $${index}
        OR CAST(a.id_registro AS TEXT) ILIKE $${index}
      )`;
      values.push(`%${q}%`);
      index++;
    }

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM auditoria_eventos a
        LEFT JOIN usuarios u ON a.realizado_por = u.id_usuario
        ${whereClause}
      `,
      values
    );
    const total = countResult.rows[0].total;

    const dataQuery = `
      SELECT
        a.*,
        u.nombre AS realizado_por_nombre,
        u.username AS realizado_por_username
      FROM auditoria_eventos a
      LEFT JOIN usuarios u
        ON a.realizado_por = u.id_usuario
      ${whereClause}
      ORDER BY a.fecha_evento DESC, a.id_auditoria DESC
      LIMIT $${index} OFFSET $${index + 1}
    `;

    const { rows } = await pool.query(dataQuery, [...values, limit, offset]);

    return res.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error al listar auditorías:", error);
    return res.status(500).json({ error: "Error interno al listar auditorías" });
  }
};

export const obtenerAuditoriaPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        a.*,
        u.nombre AS realizado_por_nombre,
        u.username AS realizado_por_username
      FROM auditoria_eventos a
      LEFT JOIN usuarios u
        ON a.realizado_por = u.id_usuario
      WHERE a.id_auditoria = $1
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Evento de auditoría no encontrado" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener auditoría por id:", error);
    return res.status(500).json({ error: "Error interno al obtener auditoría" });
  }
};

export const obtenerHistorialRegistro = async (req, res) => {
  try {
    const { tabla_afectada, id_registro } = req.params;
    const { limit, offset } = req.query;

    if (!TABLAS_VALIDAS.includes(tabla_afectada)) {
      return res.status(400).json({ error: "tabla_afectada inválida" });
    }

    const limitFinal = limit ? Number(limit) : 100;
    const offsetFinal = offset ? Number(offset) : 0;

    const query = `
      SELECT
        a.*,
        u.nombre AS realizado_por_nombre,
        u.username AS realizado_por_username
      FROM auditoria_eventos a
      LEFT JOIN usuarios u
        ON a.realizado_por = u.id_usuario
      WHERE a.tabla_afectada = $1
        AND a.id_registro = $2
      ORDER BY a.fecha_evento DESC, a.id_auditoria DESC
      LIMIT $3 OFFSET $4
    `;

    const { rows } = await pool.query(query, [
      tabla_afectada,
      id_registro,
      limitFinal,
      offsetFinal,
    ]);

    return res.json({
      tabla_afectada,
      id_registro,
      total: rows.length,
      limit: limitFinal,
      offset: offsetFinal,
      historial: rows,
    });
  } catch (error) {
    console.error("Error al obtener historial del registro:", error);
    return res.status(500).json({ error: "Error interno al obtener historial del registro" });
  }
};

export const obtenerAuditoriaPorUsuario = async (req, res) => {
  try {
    const { id_usuario } = req.params;
    const { fecha_desde, fecha_hasta, accion, limit, offset } = req.query;

    const usuarioResult = await pool.query(
      `
        SELECT id_usuario, nombre, username
        FROM usuarios
        WHERE id_usuario = $1
      `,
      [id_usuario]
    );

    if (usuarioResult.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    let query = `
      SELECT
        a.*,
        u.nombre AS realizado_por_nombre,
        u.username AS realizado_por_username
      FROM auditoria_eventos a
      LEFT JOIN usuarios u
        ON a.realizado_por = u.id_usuario
      WHERE a.realizado_por = $1
    `;

    const values = [id_usuario];
    let index = 2;

    if (fecha_desde) {
      query += ` AND a.fecha_evento >= $${index}`;
      values.push(fecha_desde);
      index++;
    }

    if (fecha_hasta) {
      query += ` AND a.fecha_evento <= $${index}`;
      values.push(fecha_hasta);
      index++;
    }

    if (accion) {
      const accionUpper = accion.toUpperCase();

      if (!ACCIONES_VALIDAS.includes(accionUpper)) {
        return res.status(400).json({ error: "acción inválida" });
      }

      query += ` AND a.accion = $${index}`;
      values.push(accionUpper);
      index++;
    }

    query += ` ORDER BY a.fecha_evento DESC, a.id_auditoria DESC`;

    const limitFinal = limit ? Number(limit) : 100;
    const offsetFinal = offset ? Number(offset) : 0;

    query += ` LIMIT $${index} OFFSET $${index + 1}`;
    values.push(limitFinal, offsetFinal);

    const { rows } = await pool.query(query, values);

    return res.json({
      usuario: usuarioResult.rows[0],
      total: rows.length,
      limit: limitFinal,
      offset: offsetFinal,
      eventos: rows,
    });
  } catch (error) {
    console.error("Error al obtener auditoría por usuario:", error);
    return res.status(500).json({ error: "Error interno al obtener auditoría por usuario" });
  }
};