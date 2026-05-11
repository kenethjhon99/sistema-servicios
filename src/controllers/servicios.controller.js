import { pool } from "../config/db.js";
import { apiErrorText } from "../i18n/apiMessages.js";
import { registrarAuditoria } from "../utils/auditoria.js";

export const crearServicio = async (req, res) => {
  try {
    const {
      id_categoria_servicio,
      nombre,
      descripcion,
      duracion_estimada_min,
      precio_base,
      requiere_materiales,
      permite_recurrencia,
    } = req.body;

    if (!id_categoria_servicio) {
      return apiErrorText(res, req, 400, "La categoría es obligatoria", "Category is required");
    }

    if (!nombre || !nombre.trim()) {
      return apiErrorText(
        res,
        req,
        400,
        "El nombre del servicio es obligatorio",
        "Service name is required"
      );
    }

    if (!duracion_estimada_min || Number(duracion_estimada_min) <= 0) {
      return apiErrorText(
        res,
        req,
        400,
        "La duración estimada debe ser mayor a 0",
        "Estimated duration must be greater than 0"
      );
    }

    const existeCategoria = await pool.query(
      `
        SELECT id_categoria_servicio, estado
        FROM categorias_servicio
        WHERE id_categoria_servicio = $1
      `,
      [id_categoria_servicio]
    );

    if (existeCategoria.rows.length === 0) {
      return apiErrorText(
        res,
        req,
        404,
        "La categoría seleccionada no existe",
        "Selected category does not exist"
      );
    }

    if (existeCategoria.rows[0].estado !== "ACTIVA") {
      return apiErrorText(
        res,
        req,
        400,
        "No se puede usar una categoría inactiva",
        "Cannot use an inactive category"
      );
    }

    const query = `
      INSERT INTO servicios (
        id_categoria_servicio,
        nombre,
        descripcion,
        duracion_estimada_min,
        precio_base,
        requiere_materiales,
        permite_recurrencia,
        created_by,
        updated_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *;
    `;

    const values = [
      id_categoria_servicio,
      nombre.trim(),
      descripcion?.trim() || null,
      Number(duracion_estimada_min),
      precio_base === "" || precio_base === undefined || precio_base === null
        ? null
        : Number(precio_base),
      requiere_materiales ?? false,
      permite_recurrencia ?? true,
      req.user?.id_usuario || null,
      req.user?.id_usuario || null,
    ];

    const { rows } = await pool.query(query, values);
    const servicio = rows[0];

    await registrarAuditoria({
      tabla_afectada: "servicios",
      id_registro: servicio.id_servicio,
      accion: "CREAR",
      descripcion: `Se creó el servicio ${servicio.nombre}`,
      valores_nuevos: servicio,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.status(201).json(servicio);
  } catch (error) {
    if (error.code === "23505") {
      return apiErrorText(
        res,
        req,
        409,
        "Ya existe un servicio con ese nombre en la categoría seleccionada",
        "A service with that name already exists in the selected category"
      );
    }

    console.error("Error al crear servicio:", error);
    return apiErrorText(res, req, 500, "Error interno al crear servicio", "Internal error while creating service");
  }
};

export const listarServicios = async (req, res) => {
  try {
    const { estado, id_categoria_servicio, busqueda } = req.query;
    const { page, limit, offset } = req.pagination || { page: 1, limit: 50, offset: 0 };

    let whereClause = " WHERE 1=1 ";
    const values = [];
    let index = 1;

    if (estado) {
      whereClause += ` AND s.estado = $${index}`;
      values.push(estado.toUpperCase());
      index++;
    }

    if (id_categoria_servicio) {
      whereClause += ` AND s.id_categoria_servicio = $${index}`;
      values.push(id_categoria_servicio);
      index++;
    }

    if (busqueda) {
      whereClause += ` AND (
        s.nombre ILIKE $${index}
        OR s.descripcion ILIKE $${index}
        OR c.nombre ILIKE $${index}
      )`;
      values.push(`%${busqueda}%`);
      index++;
    }

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM servicios s
        INNER JOIN categorias_servicio c ON s.id_categoria_servicio = c.id_categoria_servicio
        ${whereClause}
      `,
      values
    );
    const total = countResult.rows[0].total;

    const dataQuery = `
      SELECT
        s.id_servicio,
        s.id_categoria_servicio,
        c.nombre AS categoria,
        s.nombre,
        s.descripcion,
        s.duracion_estimada_min,
        s.precio_base,
        s.requiere_materiales,
        s.permite_recurrencia,
        s.estado,
        s.created_at,
        s.updated_at
      FROM servicios s
      INNER JOIN categorias_servicio c
        ON s.id_categoria_servicio = c.id_categoria_servicio
      ${whereClause}
      ORDER BY s.id_servicio DESC
      LIMIT $${index} OFFSET $${index + 1}
    `;

    const { rows } = await pool.query(dataQuery, [...values, limit, offset]);

    return res.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error al listar servicios:", error);
    return apiErrorText(res, req, 500, "Error interno al listar servicios", "Internal error while listing services");
  }
};

export const obtenerServicioPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        s.id_servicio,
        s.id_categoria_servicio,
        c.nombre AS categoria,
        s.nombre,
        s.descripcion,
        s.duracion_estimada_min,
        s.precio_base,
        s.requiere_materiales,
        s.permite_recurrencia,
        s.estado,
        s.created_at,
        s.updated_at
      FROM servicios s
      INNER JOIN categorias_servicio c
        ON s.id_categoria_servicio = c.id_categoria_servicio
      WHERE s.id_servicio = $1;
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return apiErrorText(res, req, 404, "Servicio no encontrado", "Service not found");
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener servicio:", error);
    return apiErrorText(res, req, 500, "Error interno al obtener servicio", "Internal error while loading service");
  }
};

export const actualizarServicio = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      id_categoria_servicio,
      nombre,
      descripcion,
      duracion_estimada_min,
      precio_base,
      requiere_materiales,
      permite_recurrencia,
    } = req.body;

    if (!id_categoria_servicio) {
      return apiErrorText(res, req, 400, "La categoría es obligatoria", "Category is required");
    }

    if (!nombre || !nombre.trim()) {
      return apiErrorText(
        res,
        req,
        400,
        "El nombre del servicio es obligatorio",
        "Service name is required"
      );
    }

    if (!duracion_estimada_min || Number(duracion_estimada_min) <= 0) {
      return apiErrorText(
        res,
        req,
        400,
        "La duración estimada debe ser mayor a 0",
        "Estimated duration must be greater than 0"
      );
    }

    const existeCategoria = await pool.query(
      `
        SELECT id_categoria_servicio, estado
        FROM categorias_servicio
        WHERE id_categoria_servicio = $1
      `,
      [id_categoria_servicio]
    );

    if (existeCategoria.rows.length === 0) {
      return apiErrorText(
        res,
        req,
        404,
        "La categoría seleccionada no existe",
        "Selected category does not exist"
      );
    }

    if (existeCategoria.rows[0].estado !== "ACTIVA") {
      return apiErrorText(
        res,
        req,
        400,
        "No se puede usar una categoría inactiva",
        "Cannot use an inactive category"
      );
    }

    const anteriorResult = await pool.query(`SELECT * FROM servicios WHERE id_servicio = $1`, [id]);

    if (anteriorResult.rows.length === 0) {
      return apiErrorText(res, req, 404, "Servicio no encontrado", "Service not found");
    }

    const anterior = anteriorResult.rows[0];

    const query = `
      UPDATE servicios
      SET id_categoria_servicio = $1,
          nombre = $2,
          descripcion = $3,
          duracion_estimada_min = $4,
          precio_base = $5,
          requiere_materiales = $6,
          permite_recurrencia = $7,
          updated_by = $8,
          updated_at = NOW()
      WHERE id_servicio = $9
      RETURNING *;
    `;

    const values = [
      id_categoria_servicio,
      nombre.trim(),
      descripcion?.trim() || null,
      Number(duracion_estimada_min),
      precio_base === "" || precio_base === undefined || precio_base === null
        ? null
        : Number(precio_base),
      requiere_materiales ?? false,
      permite_recurrencia ?? true,
      req.user?.id_usuario || null,
      id,
    ];

    const { rows } = await pool.query(query, values);
    const servicio = rows[0];

    await registrarAuditoria({
      tabla_afectada: "servicios",
      id_registro: servicio.id_servicio,
      accion: "ACTUALIZAR",
      descripcion: `Se actualizó el servicio ${servicio.nombre}`,
      valores_anteriores: anterior,
      valores_nuevos: servicio,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(servicio);
  } catch (error) {
    if (error.code === "23505") {
      return apiErrorText(
        res,
        req,
        409,
        "Ya existe un servicio con ese nombre en la categoría seleccionada",
        "A service with that name already exists in the selected category"
      );
    }

    console.error("Error al actualizar servicio:", error);
    return apiErrorText(res, req, 500, "Error interno al actualizar servicio", "Internal error while updating service");
  }
};

export const cambiarEstadoServicio = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !["ACTIVO", "INACTIVO"].includes(estado.toUpperCase())) {
      return apiErrorText(
        res,
        req,
        400,
        "Estado inválido. Use ACTIVO o INACTIVO",
        "Invalid status. Use ACTIVO or INACTIVO"
      );
    }

    const anteriorResult = await pool.query(`SELECT * FROM servicios WHERE id_servicio = $1`, [id]);

    if (anteriorResult.rows.length === 0) {
      return apiErrorText(res, req, 404, "Servicio no encontrado", "Service not found");
    }

    const anterior = anteriorResult.rows[0];

    const query = `
      UPDATE servicios
      SET estado = $1,
          updated_by = $2,
          updated_at = NOW()
      WHERE id_servicio = $3
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      estado.toUpperCase(),
      req.user?.id_usuario || null,
      id,
    ]);

    const servicio = rows[0];

    await registrarAuditoria({
      tabla_afectada: "servicios",
      id_registro: servicio.id_servicio,
      accion: "CAMBIAR_ESTADO",
      descripcion: `Se cambió el estado del servicio ${servicio.nombre} a ${servicio.estado}`,
      valores_anteriores: anterior,
      valores_nuevos: servicio,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(servicio);
  } catch (error) {
    console.error("Error al cambiar estado del servicio:", error);
    return apiErrorText(
      res,
      req,
      500,
      "Error interno al cambiar estado del servicio",
      "Internal error while changing service status"
    );
  }
};
