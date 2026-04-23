import { pool } from "../config/db.js";

const TIPOS_EVIDENCIA_VALIDOS = ["ANTES", "DESPUES", "GENERAL"];

export const crearEvidencia = async (req, res) => {
  try {
    const {
      id_orden_trabajo,
      tipo_evidencia,
      archivo_url,
      nombre_archivo,
      tipo_archivo,
      tamano_archivo,
      descripcion,
      orden_visual,
      subido_por,
      fecha_evidencia,
    } = req.body;

    if (!id_orden_trabajo) {
      return res.status(400).json({ error: "La orden de trabajo es obligatoria" });
    }

    if (!tipo_evidencia || !TIPOS_EVIDENCIA_VALIDOS.includes(tipo_evidencia.toUpperCase())) {
      return res.status(400).json({ error: "Tipo de evidencia inválido" });
    }

    if (!archivo_url || !archivo_url.trim()) {
      return res.status(400).json({ error: "La URL o ruta del archivo es obligatoria" });
    }

    if (
      orden_visual !== undefined &&
      orden_visual !== null &&
      Number(orden_visual) <= 0
    ) {
      return res.status(400).json({ error: "El orden visual debe ser mayor a 0" });
    }

    if (
      tamano_archivo !== undefined &&
      tamano_archivo !== null &&
      Number(tamano_archivo) < 0
    ) {
      return res.status(400).json({ error: "El tamaño del archivo no puede ser negativo" });
    }

    const ordenResult = await pool.query(
      `SELECT id_orden_trabajo
       FROM ordenes_trabajo
       WHERE id_orden_trabajo = $1`,
      [id_orden_trabajo]
    );

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({ error: "La orden de trabajo no existe" });
    }

    if (subido_por) {
      const usuarioResult = await pool.query(
        `SELECT id_usuario, estado
         FROM usuarios
         WHERE id_usuario = $1`,
        [subido_por]
      );

      if (usuarioResult.rows.length === 0) {
        return res.status(404).json({ error: "El usuario que sube la evidencia no existe" });
      }

      if (usuarioResult.rows[0].estado !== "ACTIVO") {
        return res.status(400).json({ error: "El usuario que sube la evidencia está inactivo" });
      }
    }

    const query = `
      INSERT INTO evidencias_orden (
        id_orden_trabajo,
        tipo_evidencia,
        archivo_url,
        nombre_archivo,
        tipo_archivo,
        tamano_archivo,
        descripcion,
        orden_visual,
        subido_por,
        fecha_evidencia
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *;
    `;

    const values = [
      id_orden_trabajo,
      tipo_evidencia.toUpperCase(),
      archivo_url.trim(),
      nombre_archivo?.trim() || null,
      tipo_archivo?.trim() || null,
      tamano_archivo ?? null,
      descripcion?.trim() || null,
      orden_visual ?? 1,
      subido_por || null,
      fecha_evidencia || null,
    ];

    const { rows } = await pool.query(query, values);
    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al crear evidencia:", error);
    return res.status(500).json({ error: "Error interno al crear evidencia" });
  }
};

export const crearMultiplesEvidencias = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id_orden_trabajo, evidencias } = req.body;

    if (!id_orden_trabajo) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "La orden de trabajo es obligatoria" });
    }

    if (!Array.isArray(evidencias) || evidencias.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Debe enviar un arreglo de evidencias" });
    }

    const ordenResult = await client.query(
      `SELECT id_orden_trabajo
       FROM ordenes_trabajo
       WHERE id_orden_trabajo = $1`,
      [id_orden_trabajo]
    );

    if (ordenResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "La orden de trabajo no existe" });
    }

    const evidenciasInsertadas = [];

    for (const item of evidencias) {
      const {
        tipo_evidencia,
        archivo_url,
        nombre_archivo,
        tipo_archivo,
        tamano_archivo,
        descripcion,
        orden_visual,
        subido_por,
        fecha_evidencia,
      } = item;

      if (!tipo_evidencia || !TIPOS_EVIDENCIA_VALIDOS.includes(tipo_evidencia.toUpperCase())) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Uno de los tipos de evidencia es inválido" });
      }

      if (!archivo_url || !archivo_url.trim()) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Toda evidencia debe incluir archivo_url" });
      }

      if (
        orden_visual !== undefined &&
        orden_visual !== null &&
        Number(orden_visual) <= 0
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "El orden visual debe ser mayor a 0" });
      }

      if (
        tamano_archivo !== undefined &&
        tamano_archivo !== null &&
        Number(tamano_archivo) < 0
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "El tamaño del archivo no puede ser negativo" });
      }

      if (subido_por) {
        const usuarioResult = await client.query(
          `SELECT id_usuario, estado
           FROM usuarios
           WHERE id_usuario = $1`,
          [subido_por]
        );

        if (usuarioResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Uno de los usuarios que sube evidencia no existe" });
        }

        if (usuarioResult.rows[0].estado !== "ACTIVO") {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Uno de los usuarios que sube evidencia está inactivo" });
        }
      }

      const insertResult = await client.query(
        `
          INSERT INTO evidencias_orden (
            id_orden_trabajo,
            tipo_evidencia,
            archivo_url,
            nombre_archivo,
            tipo_archivo,
            tamano_archivo,
            descripcion,
            orden_visual,
            subido_por,
            fecha_evidencia
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING *;
        `,
        [
          id_orden_trabajo,
          tipo_evidencia.toUpperCase(),
          archivo_url.trim(),
          nombre_archivo?.trim() || null,
          tipo_archivo?.trim() || null,
          tamano_archivo ?? null,
          descripcion?.trim() || null,
          orden_visual ?? 1,
          subido_por || null,
          fecha_evidencia || null,
        ]
      );

      evidenciasInsertadas.push(insertResult.rows[0]);
    }

    await client.query("COMMIT");
    return res.status(201).json(evidenciasInsertadas);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al crear evidencias en lote:", error);
    return res.status(500).json({ error: "Error interno al crear evidencias" });
  } finally {
    client.release();
  }
};

export const listarEvidenciasPorOrden = async (req, res) => {
  try {
    const { id_orden_trabajo } = req.params;
    const { tipo_evidencia } = req.query;

    let query = `
      SELECT
        e.*,
        u.nombre AS nombre_usuario
      FROM evidencias_orden e
      LEFT JOIN usuarios u
        ON e.subido_por = u.id_usuario
      WHERE e.id_orden_trabajo = $1
    `;

    const values = [id_orden_trabajo];

    if (tipo_evidencia) {
      if (!TIPOS_EVIDENCIA_VALIDOS.includes(tipo_evidencia.toUpperCase())) {
        return res.status(400).json({ error: "Tipo de evidencia inválido" });
      }

      query += ` AND e.tipo_evidencia = $2`;
      values.push(tipo_evidencia.toUpperCase());
    }

    query += ` ORDER BY e.tipo_evidencia, e.orden_visual ASC, e.id_evidencia ASC`;

    const { rows } = await pool.query(query, values);
    return res.json(rows);
  } catch (error) {
    console.error("Error al listar evidencias:", error);
    return res.status(500).json({ error: "Error interno al listar evidencias" });
  }
};

export const obtenerEvidenciaPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        e.*,
        u.nombre AS nombre_usuario
      FROM evidencias_orden e
      LEFT JOIN usuarios u
        ON e.subido_por = u.id_usuario
      WHERE e.id_evidencia = $1;
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Evidencia no encontrada" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener evidencia:", error);
    return res.status(500).json({ error: "Error interno al obtener evidencia" });
  }
};

export const actualizarEvidencia = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tipo_evidencia,
      archivo_url,
      nombre_archivo,
      tipo_archivo,
      tamano_archivo,
      descripcion,
      orden_visual,
      subido_por,
      fecha_evidencia,
    } = req.body;

    if (!tipo_evidencia || !TIPOS_EVIDENCIA_VALIDOS.includes(tipo_evidencia.toUpperCase())) {
      return res.status(400).json({ error: "Tipo de evidencia inválido" });
    }

    if (!archivo_url || !archivo_url.trim()) {
      return res.status(400).json({ error: "La URL o ruta del archivo es obligatoria" });
    }

    if (
      orden_visual !== undefined &&
      orden_visual !== null &&
      Number(orden_visual) <= 0
    ) {
      return res.status(400).json({ error: "El orden visual debe ser mayor a 0" });
    }

    if (
      tamano_archivo !== undefined &&
      tamano_archivo !== null &&
      Number(tamano_archivo) < 0
    ) {
      return res.status(400).json({ error: "El tamaño del archivo no puede ser negativo" });
    }

    if (subido_por) {
      const usuarioResult = await pool.query(
        `SELECT id_usuario, estado
         FROM usuarios
         WHERE id_usuario = $1`,
        [subido_por]
      );

      if (usuarioResult.rows.length === 0) {
        return res.status(404).json({ error: "El usuario que sube la evidencia no existe" });
      }

      if (usuarioResult.rows[0].estado !== "ACTIVO") {
        return res.status(400).json({ error: "El usuario que sube la evidencia está inactivo" });
      }
    }

    const query = `
      UPDATE evidencias_orden
      SET tipo_evidencia = $1,
          archivo_url = $2,
          nombre_archivo = $3,
          tipo_archivo = $4,
          tamano_archivo = $5,
          descripcion = $6,
          orden_visual = $7,
          subido_por = $8,
          fecha_evidencia = $9
      WHERE id_evidencia = $10
      RETURNING *;
    `;

    const values = [
      tipo_evidencia.toUpperCase(),
      archivo_url.trim(),
      nombre_archivo?.trim() || null,
      tipo_archivo?.trim() || null,
      tamano_archivo ?? null,
      descripcion?.trim() || null,
      orden_visual ?? 1,
      subido_por || null,
      fecha_evidencia || null,
      id,
    ];

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Evidencia no encontrada" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al actualizar evidencia:", error);
    return res.status(500).json({ error: "Error interno al actualizar evidencia" });
  }
};

export const eliminarEvidencia = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      DELETE FROM evidencias_orden
      WHERE id_evidencia = $1
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Evidencia no encontrada" });
    }

    return res.json({
      mensaje: "Evidencia eliminada correctamente",
      evidencia: rows[0],
    });
  } catch (error) {
    console.error("Error al eliminar evidencia:", error);
    return res.status(500).json({ error: "Error interno al eliminar evidencia" });
  }
};