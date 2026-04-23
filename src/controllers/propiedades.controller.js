import { pool } from "../config/db.js";

const TIPOS_PROPIEDAD = [
  "CASA",
  "RESIDENCIAL",
  "TERRENO",
  "COMERCIO",
  "BODEGA",
  "OFICINA",
  "OTRA",
];

export const crearPropiedad = async (req, res) => {
  try {
    const {
      id_cliente,
      nombre_propiedad,
      tipo_propiedad,
      direccion,
      referencia,
      ubicacion_maps,
      latitud,
      longitud,
      link_maps,
      tamano_aproximado_m2,
      notas_acceso,
      contacto_recibe,
      telefono_contacto_recibe,
    } = req.body;

    if (!id_cliente) {
      return res.status(400).json({ error: "El cliente es obligatorio" });
    }

    if (!nombre_propiedad || !nombre_propiedad.trim()) {
      return res.status(400).json({ error: "El nombre de la propiedad es obligatorio" });
    }

    if (!tipo_propiedad || !TIPOS_PROPIEDAD.includes(tipo_propiedad.toUpperCase())) {
      return res.status(400).json({ error: "Tipo de propiedad inválido" });
    }

    if (!direccion || !direccion.trim()) {
      return res.status(400).json({ error: "La dirección es obligatoria" });
    }

    const existeCliente = await pool.query(
      `SELECT id_cliente, estado FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (existeCliente.rows.length === 0) {
      return res.status(404).json({ error: "El cliente no existe" });
    }

    if (existeCliente.rows[0].estado !== "ACTIVO") {
      return res.status(400).json({ error: "No se puede agregar propiedad a un cliente inactivo" });
    }

    const query = `
      INSERT INTO propiedades (
        id_cliente,
        nombre_propiedad,
        tipo_propiedad,
        direccion,
        referencia,
        ubicacion_maps,
        latitud,
        longitud,
        link_maps,
        tamano_aproximado_m2,
        notas_acceso,
        contacto_recibe,
        telefono_contacto_recibe
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *;
    `;

    const values = [
      id_cliente,
      nombre_propiedad.trim(),
      tipo_propiedad.toUpperCase(),
      direccion.trim(),
      referencia?.trim() || null,
      ubicacion_maps?.trim() || null,
      latitud === "" || latitud === undefined || latitud === null ? null : Number(latitud),
      longitud === "" || longitud === undefined || longitud === null ? null : Number(longitud),
      link_maps?.trim() || null,
      tamano_aproximado_m2 === "" || tamano_aproximado_m2 === undefined || tamano_aproximado_m2 === null
        ? null
        : Number(tamano_aproximado_m2),
      notas_acceso?.trim() || null,
      contacto_recibe?.trim() || null,
      telefono_contacto_recibe?.trim() || null,
    ];

    const { rows } = await pool.query(query, values);
    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al crear propiedad:", error);
    return res.status(500).json({ error: "Error interno al crear propiedad" });
  }
};

export const listarPropiedades = async (req, res) => {
  try {
    const { estado, id_cliente, tipo_propiedad, busqueda } = req.query;

    let query = `
      SELECT
        p.*,
        c.nombre_completo,
        c.nombre_empresa
      FROM propiedades p
      INNER JOIN clientes c
        ON p.id_cliente = c.id_cliente
      WHERE 1=1
    `;

    const values = [];
    let index = 1;

    if (estado) {
      query += ` AND p.estado = $${index}`;
      values.push(estado.toUpperCase());
      index++;
    }

    if (id_cliente) {
      query += ` AND p.id_cliente = $${index}`;
      values.push(id_cliente);
      index++;
    }

    if (tipo_propiedad) {
      query += ` AND p.tipo_propiedad = $${index}`;
      values.push(tipo_propiedad.toUpperCase());
      index++;
    }

    if (busqueda) {
      query += ` AND (
        p.nombre_propiedad ILIKE $${index}
        OR p.direccion ILIKE $${index}
        OR p.referencia ILIKE $${index}
        OR c.nombre_completo ILIKE $${index}
        OR c.nombre_empresa ILIKE $${index}
      )`;
      values.push(`%${busqueda}%`);
      index++;
    }

    query += ` ORDER BY p.id_propiedad DESC`;

    const { rows } = await pool.query(query, values);
    return res.json(rows);
  } catch (error) {
    console.error("Error al listar propiedades:", error);
    return res.status(500).json({ error: "Error interno al listar propiedades" });
  }
};

export const listarPropiedadesPorCliente = async (req, res) => {
  try {
    const { id_cliente } = req.params;

    const existeCliente = await pool.query(
      `SELECT id_cliente FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (existeCliente.rows.length === 0) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const query = `
      SELECT *
      FROM propiedades
      WHERE id_cliente = $1
      ORDER BY id_propiedad DESC;
    `;

    const { rows } = await pool.query(query, [id_cliente]);
    return res.json(rows);
  } catch (error) {
    console.error("Error al listar propiedades del cliente:", error);
    return res.status(500).json({ error: "Error interno al listar propiedades del cliente" });
  }
};

export const obtenerPropiedadPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        p.*,
        c.nombre_completo,
        c.nombre_empresa
      FROM propiedades p
      INNER JOIN clientes c
        ON p.id_cliente = c.id_cliente
      WHERE p.id_propiedad = $1;
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Propiedad no encontrada" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener propiedad:", error);
    return res.status(500).json({ error: "Error interno al obtener propiedad" });
  }
};

export const actualizarPropiedad = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      id_cliente,
      nombre_propiedad,
      tipo_propiedad,
      direccion,
      referencia,
      ubicacion_maps,
      latitud,
      longitud,
      link_maps,
      tamano_aproximado_m2,
      notas_acceso,
      contacto_recibe,
      telefono_contacto_recibe,
    } = req.body;

    if (!id_cliente) {
      return res.status(400).json({ error: "El cliente es obligatorio" });
    }

    if (!nombre_propiedad || !nombre_propiedad.trim()) {
      return res.status(400).json({ error: "El nombre de la propiedad es obligatorio" });
    }

    if (!tipo_propiedad || !TIPOS_PROPIEDAD.includes(tipo_propiedad.toUpperCase())) {
      return res.status(400).json({ error: "Tipo de propiedad inválido" });
    }

    if (!direccion || !direccion.trim()) {
      return res.status(400).json({ error: "La dirección es obligatoria" });
    }

    const existeCliente = await pool.query(
      `SELECT id_cliente, estado FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (existeCliente.rows.length === 0) {
      return res.status(404).json({ error: "El cliente no existe" });
    }

    if (existeCliente.rows[0].estado !== "ACTIVO") {
      return res.status(400).json({ error: "No se puede asignar a un cliente inactivo" });
    }

    const query = `
      UPDATE propiedades
      SET id_cliente = $1,
          nombre_propiedad = $2,
          tipo_propiedad = $3,
          direccion = $4,
          referencia = $5,
          ubicacion_maps = $6,
          latitud = $7,
          longitud = $8,
          link_maps = $9,
          tamano_aproximado_m2 = $10,
          notas_acceso = $11,
          contacto_recibe = $12,
          telefono_contacto_recibe = $13,
          updated_at = NOW()
      WHERE id_propiedad = $14
      RETURNING *;
    `;

    const values = [
      id_cliente,
      nombre_propiedad.trim(),
      tipo_propiedad.toUpperCase(),
      direccion.trim(),
      referencia?.trim() || null,
      ubicacion_maps?.trim() || null,
      latitud === "" || latitud === undefined || latitud === null ? null : Number(latitud),
      longitud === "" || longitud === undefined || longitud === null ? null : Number(longitud),
      link_maps?.trim() || null,
      tamano_aproximado_m2 === "" || tamano_aproximado_m2 === undefined || tamano_aproximado_m2 === null
        ? null
        : Number(tamano_aproximado_m2),
      notas_acceso?.trim() || null,
      contacto_recibe?.trim() || null,
      telefono_contacto_recibe?.trim() || null,
      id,
    ];

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Propiedad no encontrada" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al actualizar propiedad:", error);
    return res.status(500).json({ error: "Error interno al actualizar propiedad" });
  }
};

export const cambiarEstadoPropiedad = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !["ACTIVA", "INACTIVA"].includes(estado.toUpperCase())) {
      return res.status(400).json({ error: "Estado inválido. Use ACTIVA o INACTIVA" });
    }

    const query = `
      UPDATE propiedades
      SET estado = $1,
          updated_at = NOW()
      WHERE id_propiedad = $2
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [estado.toUpperCase(), id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Propiedad no encontrada" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al cambiar estado de propiedad:", error);
    return res.status(500).json({ error: "Error interno al cambiar estado de propiedad" });
  }
};