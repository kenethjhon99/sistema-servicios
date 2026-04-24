import { pool } from "../config/db.js";
import { registrarAuditoria } from "../utils/auditoria.js";

const ESTADOS_VALIDOS = ["ACTIVA", "INACTIVA"];

export const crearCategoria = async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    const query = `
      INSERT INTO categorias_servicio (
        nombre,
        descripcion,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const values = [
      nombre.trim().toUpperCase(),
      descripcion?.trim() || null,
      req.user?.id_usuario || null,
      req.user?.id_usuario || null,
    ];

    const { rows } = await pool.query(query, values);
    const categoria = rows[0];

    await registrarAuditoria({
      tabla_afectada: "categorias_servicio",
      id_registro: categoria.id_categoria_servicio,
      accion: "CREAR",
      descripcion: `Se creó la categoría ${categoria.nombre}`,
      valores_nuevos: categoria,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.status(201).json(categoria);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Ya existe una categoría con ese nombre" });
    }

    console.error("Error al crear categoría:", error);
    return res.status(500).json({ error: "Error interno al crear categoría" });
  }
};

export const listarCategorias = async (req, res) => {
  try {
    const { estado } = req.query;

    let query = `
      SELECT *
      FROM categorias_servicio
    `;
    const values = [];

    if (estado) {
      query += ` WHERE estado = $1`;
      values.push(estado.toUpperCase());
    }

    query += ` ORDER BY id_categoria_servicio DESC`;

    const { rows } = await pool.query(query, values);
    return res.json(rows);
  } catch (error) {
    console.error("Error al listar categorías:", error);
    return res.status(500).json({ error: "Error interno al listar categorías" });
  }
};

export const obtenerCategoriaPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT *
      FROM categorias_servicio
      WHERE id_categoria_servicio = $1;
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener categoría:", error);
    return res.status(500).json({ error: "Error interno al obtener categoría" });
  }
};

export const actualizarCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    const anteriorResult = await pool.query(
      `SELECT * FROM categorias_servicio WHERE id_categoria_servicio = $1`,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }

    const anterior = anteriorResult.rows[0];

    const query = `
      UPDATE categorias_servicio
      SET nombre = $1,
          descripcion = $2,
          updated_by = $3,
          updated_at = NOW()
      WHERE id_categoria_servicio = $4
      RETURNING *;
    `;

    const values = [
      nombre.trim().toUpperCase(),
      descripcion?.trim() || null,
      req.user?.id_usuario || null,
      id,
    ];

    const { rows } = await pool.query(query, values);
    const categoria = rows[0];

    await registrarAuditoria({
      tabla_afectada: "categorias_servicio",
      id_registro: categoria.id_categoria_servicio,
      accion: "ACTUALIZAR",
      descripcion: `Se actualizó la categoría ${categoria.nombre}`,
      valores_anteriores: anterior,
      valores_nuevos: categoria,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(categoria);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Ya existe una categoría con ese nombre" });
    }

    console.error("Error al actualizar categoría:", error);
    return res.status(500).json({ error: "Error interno al actualizar categoría" });
  }
};

export const cambiarEstadoCategoria = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !ESTADOS_VALIDOS.includes(estado.toUpperCase())) {
      return res.status(400).json({ error: "Estado inválido. Use ACTIVA o INACTIVA" });
    }

    const anteriorResult = await pool.query(
      `SELECT * FROM categorias_servicio WHERE id_categoria_servicio = $1`,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }

    const anterior = anteriorResult.rows[0];

    const query = `
      UPDATE categorias_servicio
      SET estado = $1,
          updated_by = $2,
          updated_at = NOW()
      WHERE id_categoria_servicio = $3
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      estado.toUpperCase(),
      req.user?.id_usuario || null,
      id,
    ]);

    const categoria = rows[0];

    await registrarAuditoria({
      tabla_afectada: "categorias_servicio",
      id_registro: categoria.id_categoria_servicio,
      accion: "CAMBIAR_ESTADO",
      descripcion: `Se cambió el estado de la categoría ${categoria.nombre} a ${categoria.estado}`,
      valores_anteriores: anterior,
      valores_nuevos: categoria,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(categoria);
  } catch (error) {
    console.error("Error al cambiar estado de categoría:", error);
    return res.status(500).json({ error: "Error interno al cambiar estado de categoría" });
  }
};
