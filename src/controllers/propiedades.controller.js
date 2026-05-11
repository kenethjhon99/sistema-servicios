import { pool } from "../config/db.js";
import { apiErrorText } from "../i18n/apiMessages.js";
import { registrarAuditoria } from "../utils/auditoria.js";

const TIPOS_PROPIEDAD = [
  "CASA",
  "RESIDENCIAL",
  "TERRENO",
  "COMERCIO",
  "BODEGA",
  "OFICINA",
  "OTRA",
];

const ESTADOS_VALIDOS = ["ACTIVA", "INACTIVA"];

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
      return apiErrorText(res, req, 400, "El cliente es obligatorio", "Client is required");
    }

    if (!nombre_propiedad || !nombre_propiedad.trim()) {
      return apiErrorText(
        res,
        req,
        400,
        "El nombre de la propiedad es obligatorio",
        "Property name is required"
      );
    }

    if (!tipo_propiedad || !TIPOS_PROPIEDAD.includes(tipo_propiedad.toUpperCase())) {
      return apiErrorText(res, req, 400, "Tipo de propiedad inválido", "Invalid property type");
    }

    if (!direccion || !direccion.trim()) {
      return apiErrorText(res, req, 400, "La dirección es obligatoria", "Address is required");
    }

    const existeCliente = await pool.query(
      `SELECT id_cliente, estado FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (existeCliente.rows.length === 0) {
      return apiErrorText(res, req, 404, "El cliente no existe", "Client does not exist");
    }

    if (existeCliente.rows[0].estado !== "ACTIVO") {
      return apiErrorText(
        res,
        req,
        400,
        "No se puede agregar propiedad a un cliente inactivo",
        "Cannot add a property to an inactive client"
      );
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
        telefono_contacto_recibe,
        created_by,
        updated_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
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
      req.user?.id_usuario || null,
      req.user?.id_usuario || null,
    ];

    const { rows } = await pool.query(query, values);
    const propiedad = rows[0];

    await registrarAuditoria({
      tabla_afectada: "propiedades",
      id_registro: propiedad.id_propiedad,
      accion: "CREAR",
      descripcion: `Se creó la propiedad ${propiedad.nombre_propiedad}`,
      valores_nuevos: propiedad,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.status(201).json(propiedad);
  } catch (error) {
    console.error("Error al crear propiedad:", error);
    return apiErrorText(res, req, 500, "Error interno al crear propiedad", "Internal error while creating property");
  }
};

export const listarPropiedades = async (req, res) => {
  try {
    const { estado, id_cliente, tipo_propiedad, busqueda } = req.query;
    const { page, limit, offset } = req.pagination || { page: 1, limit: 50, offset: 0 };

    let whereClause = " WHERE 1=1 ";
    const values = [];
    let index = 1;

    if (estado) {
      whereClause += ` AND p.estado = $${index}`;
      values.push(estado.toUpperCase());
      index++;
    }

    if (id_cliente) {
      whereClause += ` AND p.id_cliente = $${index}`;
      values.push(id_cliente);
      index++;
    }

    if (tipo_propiedad) {
      whereClause += ` AND p.tipo_propiedad = $${index}`;
      values.push(tipo_propiedad.toUpperCase());
      index++;
    }

    if (busqueda) {
      whereClause += ` AND (
        p.nombre_propiedad ILIKE $${index}
        OR p.direccion ILIKE $${index}
        OR p.referencia ILIKE $${index}
        OR c.nombre_completo ILIKE $${index}
        OR c.nombre_empresa ILIKE $${index}
      )`;
      values.push(`%${busqueda}%`);
      index++;
    }

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM propiedades p
        INNER JOIN clientes c ON p.id_cliente = c.id_cliente
        ${whereClause}
      `,
      values
    );
    const total = countResult.rows[0].total;

    const dataQuery = `
      SELECT
        p.*,
        c.nombre_completo,
        c.nombre_empresa
      FROM propiedades p
      INNER JOIN clientes c
        ON p.id_cliente = c.id_cliente
      ${whereClause}
      ORDER BY p.id_propiedad DESC
      LIMIT $${index} OFFSET $${index + 1}
    `;

    const { rows } = await pool.query(dataQuery, [...values, limit, offset]);

    return res.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error al listar propiedades:", error);
    return apiErrorText(res, req, 500, "Error interno al listar propiedades", "Internal error while listing properties");
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
      return apiErrorText(res, req, 404, "Cliente no encontrado", "Client not found");
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
    return apiErrorText(
      res,
      req,
      500,
      "Error interno al listar propiedades del cliente",
      "Internal error while listing client properties"
    );
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
      return apiErrorText(res, req, 404, "Propiedad no encontrada", "Property not found");
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener propiedad:", error);
    return apiErrorText(res, req, 500, "Error interno al obtener propiedad", "Internal error while loading property");
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
      return apiErrorText(res, req, 400, "El cliente es obligatorio", "Client is required");
    }

    if (!nombre_propiedad || !nombre_propiedad.trim()) {
      return apiErrorText(
        res,
        req,
        400,
        "El nombre de la propiedad es obligatorio",
        "Property name is required"
      );
    }

    if (!tipo_propiedad || !TIPOS_PROPIEDAD.includes(tipo_propiedad.toUpperCase())) {
      return apiErrorText(res, req, 400, "Tipo de propiedad inválido", "Invalid property type");
    }

    if (!direccion || !direccion.trim()) {
      return apiErrorText(res, req, 400, "La dirección es obligatoria", "Address is required");
    }

    const anteriorResult = await pool.query(`SELECT * FROM propiedades WHERE id_propiedad = $1`, [id]);

    if (anteriorResult.rows.length === 0) {
      return apiErrorText(res, req, 404, "Propiedad no encontrada", "Property not found");
    }

    const anterior = anteriorResult.rows[0];

    const existeCliente = await pool.query(
      `SELECT id_cliente, estado FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (existeCliente.rows.length === 0) {
      return apiErrorText(res, req, 404, "El cliente no existe", "Client does not exist");
    }

    if (existeCliente.rows[0].estado !== "ACTIVO") {
      return apiErrorText(
        res,
        req,
        400,
        "No se puede asignar a un cliente inactivo",
        "Cannot assign to an inactive client"
      );
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
          updated_by = $14,
          updated_at = NOW()
      WHERE id_propiedad = $15
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
      req.user?.id_usuario || null,
      id,
    ];

    const { rows } = await pool.query(query, values);
    const propiedad = rows[0];

    await registrarAuditoria({
      tabla_afectada: "propiedades",
      id_registro: propiedad.id_propiedad,
      accion: "ACTUALIZAR",
      descripcion: `Se actualizó la propiedad ${propiedad.nombre_propiedad}`,
      valores_anteriores: anterior,
      valores_nuevos: propiedad,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(propiedad);
  } catch (error) {
    console.error("Error al actualizar propiedad:", error);
    return apiErrorText(res, req, 500, "Error interno al actualizar propiedad", "Internal error while updating property");
  }
};

export const cambiarEstadoPropiedad = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !ESTADOS_VALIDOS.includes(estado.toUpperCase())) {
      return apiErrorText(
        res,
        req,
        400,
        "Estado inválido. Use ACTIVA o INACTIVA",
        "Invalid status. Use ACTIVA or INACTIVA"
      );
    }

    const anteriorResult = await pool.query(`SELECT * FROM propiedades WHERE id_propiedad = $1`, [id]);

    if (anteriorResult.rows.length === 0) {
      return apiErrorText(res, req, 404, "Propiedad no encontrada", "Property not found");
    }

    const anterior = anteriorResult.rows[0];

    const query = `
      UPDATE propiedades
      SET estado = $1,
          updated_by = $2,
          updated_at = NOW()
      WHERE id_propiedad = $3
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      estado.toUpperCase(),
      req.user?.id_usuario || null,
      id,
    ]);

    const propiedad = rows[0];

    await registrarAuditoria({
      tabla_afectada: "propiedades",
      id_registro: propiedad.id_propiedad,
      accion: "CAMBIAR_ESTADO",
      descripcion: `Se cambió el estado de la propiedad ${propiedad.nombre_propiedad} a ${propiedad.estado}`,
      valores_anteriores: anterior,
      valores_nuevos: propiedad,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(propiedad);
  } catch (error) {
    console.error("Error al cambiar estado de propiedad:", error);
    return apiErrorText(
      res,
      req,
      500,
      "Error interno al cambiar estado de propiedad",
      "Internal error while changing property status"
    );
  }
};
