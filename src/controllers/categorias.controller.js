import { pool } from "../config/db.js";

export const crearCategoria = async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    const query = `
      INSERT INTO categorias_servicio (nombre, descripcion)
      VALUES ($1, $2)
      RETURNING *;
    `;

    const values = [nombre.trim().toUpperCase(), descripcion?.trim() || null];
    const { rows } = await pool.query(query, values);

    return res.status(201).json(rows[0]);
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

    const query = `
      UPDATE categorias_servicio
      SET nombre = $1,
          descripcion = $2,
          updated_at = NOW()
      WHERE id_categoria_servicio = $3
      RETURNING *;
    `;

    const values = [nombre.trim().toUpperCase(), descripcion?.trim() || null, id];
    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }

    return res.json(rows[0]);
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

    if (!estado || !["ACTIVA", "INACTIVA"].includes(estado.toUpperCase())) {
      return res.status(400).json({ error: "Estado inválido. Use ACTIVA o INACTIVA" });
    }

    const query = `
      UPDATE categorias_servicio
      SET estado = $1,
          updated_at = NOW()
      WHERE id_categoria_servicio = $2
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [estado.toUpperCase(), id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al cambiar estado de categoría:", error);
    return res.status(500).json({ error: "Error interno al cambiar estado de categoría" });
  }
};