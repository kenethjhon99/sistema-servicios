import { pool } from "../config/db.js";
import { registrarAuditoria } from "../utils/auditoria.js";

const ESTADOS_VALIDOS = ["ACTIVA", "INACTIVA"];

const buildBaseWhere = ({ estado, busqueda }) => {
  let whereClause = " WHERE 1=1 ";
  const values = [];
  let index = 1;

  if (estado) {
    const estadoUpper = estado.toUpperCase();
    if (!ESTADOS_VALIDOS.includes(estadoUpper)) {
      return {
        error: { status: 400, body: { error: "Estado invalido. Use ACTIVA o INACTIVA" } },
      };
    }

    whereClause += ` AND cu.estado = $${index}`;
    values.push(estadoUpper);
    index++;
  }

  if (busqueda) {
    whereClause += ` AND (
      cu.nombre ILIKE $${index}
      OR cu.descripcion ILIKE $${index}
    )`;
    values.push(`%${busqueda}%`);
    index++;
  }

  return { whereClause, values, index };
};

export const listarCuadrillas = async (req, res) => {
  try {
    const { estado, busqueda } = req.query;
    const { page, limit, offset } = req.pagination || {
      page: 1,
      limit: 50,
      offset: 0,
    };

    const filters = buildBaseWhere({ estado, busqueda });
    if (filters.error) {
      return res.status(filters.error.status).json(filters.error.body);
    }

    const { whereClause, values, index } = filters;

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM cuadrillas cu
        ${whereClause}
      `,
      values
    );
    const total = countResult.rows[0].total;

    const dataQuery = `
      SELECT
        cu.id_cuadrilla,
        cu.nombre,
        cu.descripcion,
        cu.estado,
        cu.created_at,
        cu.updated_at,
        COUNT(e.id_empleado)::int AS total_empleados,
        COUNT(*) FILTER (WHERE e.estado = 'ACTIVO')::int AS empleados_activos
      FROM cuadrillas cu
      LEFT JOIN empleados e
        ON e.id_cuadrilla = cu.id_cuadrilla
      ${whereClause}
      GROUP BY cu.id_cuadrilla
      ORDER BY cu.nombre ASC, cu.id_cuadrilla ASC
      LIMIT $${index} OFFSET $${index + 1}
    `;

    const { rows } = await pool.query(dataQuery, [...values, limit, offset]);

    return res.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error al listar cuadrillas:", error);
    return res.status(500).json({ error: "Error interno al listar cuadrillas" });
  }
};

export const obtenerCuadrillaPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `
        SELECT
          cu.id_cuadrilla,
          cu.nombre,
          cu.descripcion,
          cu.estado,
          cu.created_at,
          cu.updated_at,
          COUNT(e.id_empleado)::int AS total_empleados,
          COUNT(*) FILTER (WHERE e.estado = 'ACTIVO')::int AS empleados_activos
        FROM cuadrillas cu
        LEFT JOIN empleados e
          ON e.id_cuadrilla = cu.id_cuadrilla
        WHERE cu.id_cuadrilla = $1
        GROUP BY cu.id_cuadrilla
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Cuadrilla no encontrada" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener cuadrilla:", error);
    return res.status(500).json({ error: "Error interno al obtener cuadrilla" });
  }
};

export const crearCuadrilla = async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre de la cuadrilla es obligatorio" });
    }

    const { rows } = await pool.query(
      `
        INSERT INTO cuadrillas (
          nombre,
          descripcion,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, $3)
        RETURNING *
      `,
      [
        nombre.trim(),
        descripcion?.trim() || null,
        req.user?.id_usuario || null,
      ]
    );

    const cuadrilla = rows[0];

    await registrarAuditoria({
      tabla_afectada: "cuadrillas",
      id_registro: cuadrilla.id_cuadrilla,
      accion: "CREAR",
      descripcion: `Se creo la cuadrilla ${cuadrilla.nombre}`,
      valores_nuevos: cuadrilla,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.status(201).json(cuadrilla);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Ya existe una cuadrilla con ese nombre" });
    }

    console.error("Error al crear cuadrilla:", error);
    return res.status(500).json({ error: "Error interno al crear cuadrilla" });
  }
};

export const actualizarCuadrilla = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre de la cuadrilla es obligatorio" });
    }

    const anteriorResult = await pool.query(
      `SELECT * FROM cuadrillas WHERE id_cuadrilla = $1`,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return res.status(404).json({ error: "Cuadrilla no encontrada" });
    }

    const anterior = anteriorResult.rows[0];

    const { rows } = await pool.query(
      `
        UPDATE cuadrillas
        SET nombre = $1,
            descripcion = $2,
            updated_by = $3,
            updated_at = NOW()
        WHERE id_cuadrilla = $4
        RETURNING *
      `,
      [
        nombre.trim(),
        descripcion?.trim() || null,
        req.user?.id_usuario || null,
        id,
      ]
    );

    const cuadrilla = rows[0];

    await registrarAuditoria({
      tabla_afectada: "cuadrillas",
      id_registro: cuadrilla.id_cuadrilla,
      accion: "ACTUALIZAR",
      descripcion: `Se actualizo la cuadrilla ${cuadrilla.nombre}`,
      valores_anteriores: anterior,
      valores_nuevos: cuadrilla,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(cuadrilla);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Ya existe una cuadrilla con ese nombre" });
    }

    console.error("Error al actualizar cuadrilla:", error);
    return res.status(500).json({ error: "Error interno al actualizar cuadrilla" });
  }
};

export const cambiarEstadoCuadrilla = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !ESTADOS_VALIDOS.includes(estado.toUpperCase())) {
      return res.status(400).json({ error: "Estado invalido. Use ACTIVA o INACTIVA" });
    }

    const anteriorResult = await pool.query(
      `SELECT * FROM cuadrillas WHERE id_cuadrilla = $1`,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return res.status(404).json({ error: "Cuadrilla no encontrada" });
    }

    const anterior = anteriorResult.rows[0];

    const { rows } = await pool.query(
      `
        UPDATE cuadrillas
        SET estado = $1,
            updated_by = $2,
            updated_at = NOW()
        WHERE id_cuadrilla = $3
        RETURNING *
      `,
      [estado.toUpperCase(), req.user?.id_usuario || null, id]
    );

    const cuadrilla = rows[0];

    await registrarAuditoria({
      tabla_afectada: "cuadrillas",
      id_registro: cuadrilla.id_cuadrilla,
      accion: "CAMBIAR_ESTADO",
      descripcion: `Se cambio el estado de la cuadrilla ${cuadrilla.nombre} a ${cuadrilla.estado}`,
      valores_anteriores: anterior,
      valores_nuevos: cuadrilla,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(cuadrilla);
  } catch (error) {
    console.error("Error al cambiar estado de cuadrilla:", error);
    return res.status(500).json({ error: "Error interno al cambiar estado de cuadrilla" });
  }
};
