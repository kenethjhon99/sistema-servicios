import { pool } from "../config/db.js";
import { registrarAuditoria } from "../utils/auditoria.js";

export const crearCliente = async (req, res) => {
  try {
    const {
      codigo_cliente,
      nombre_completo,
      nombre_empresa,
      telefono,
      telefono_secundario,
      correo,
      nit,
      dpi,
      direccion_principal,
      tipo_cliente,
      observaciones,
    } = req.body;

    if (!nombre_completo || !nombre_completo.trim()) {
      return res.status(400).json({ error: "El nombre completo es obligatorio" });
    }

    const tipo = tipo_cliente ? tipo_cliente.toUpperCase() : "HABITUAL";
    if (!["HABITUAL", "NO_HABITUAL"].includes(tipo)) {
      return res.status(400).json({ error: "Tipo de cliente inválido" });
    }

    const query = `
      INSERT INTO clientes (
        codigo_cliente,
        nombre_completo,
        nombre_empresa,
        telefono,
        telefono_secundario,
        correo,
        nit,
        dpi,
        direccion_principal,
        tipo_cliente,
        observaciones,
        created_by,
        updated_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *;
    `;

    const values = [
      codigo_cliente?.trim() || null,
      nombre_completo.trim(),
      nombre_empresa?.trim() || null,
      telefono?.trim() || null,
      telefono_secundario?.trim() || null,
      correo?.trim() || null,
      nit?.trim() || null,
      dpi?.trim() || null,
      direccion_principal?.trim() || null,
      tipo,
      observaciones?.trim() || null,
      req.user?.id_usuario || null,
      req.user?.id_usuario || null,
    ];

    const { rows } = await pool.query(query, values);
    const cliente = rows[0];

    await registrarAuditoria({
      tabla_afectada: "clientes",
      id_registro: cliente.id_cliente,
      accion: "CREAR",
      descripcion: `Se creó el cliente ${cliente.nombre_completo}`,
      valores_nuevos: cliente,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.status(201).json(cliente);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "Ya existe un cliente con ese código u otro dato único",
      });
    }

    console.error("Error al crear cliente:", error);
    return res.status(500).json({ error: "Error interno al crear cliente" });
  }
};

export const listarClientes = async (req, res) => {
  try {
    const { estado, tipo_cliente, busqueda } = req.query;

    let query = `
      SELECT *
      FROM clientes
      WHERE 1=1
    `;
    const values = [];
    let index = 1;

    if (estado) {
      query += ` AND estado = $${index}`;
      values.push(estado.toUpperCase());
      index++;
    }

    if (tipo_cliente) {
      query += ` AND tipo_cliente = $${index}`;
      values.push(tipo_cliente.toUpperCase());
      index++;
    }

    if (busqueda) {
      query += ` AND (
        nombre_completo ILIKE $${index}
        OR nombre_empresa ILIKE $${index}
        OR telefono ILIKE $${index}
        OR correo ILIKE $${index}
        OR nit ILIKE $${index}
      )`;
      values.push(`%${busqueda}%`);
      index++;
    }

    query += ` ORDER BY id_cliente DESC`;

    const { rows } = await pool.query(query, values);
    return res.json(rows);
  } catch (error) {
    console.error("Error al listar clientes:", error);
    return res.status(500).json({ error: "Error interno al listar clientes" });
  }
};

export const obtenerClientePorId = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT *
      FROM clientes
      WHERE id_cliente = $1;
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener cliente:", error);
    return res.status(500).json({ error: "Error interno al obtener cliente" });
  }
};

export const actualizarCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      codigo_cliente,
      nombre_completo,
      nombre_empresa,
      telefono,
      telefono_secundario,
      correo,
      nit,
      dpi,
      direccion_principal,
      tipo_cliente,
      observaciones,
    } = req.body;

    if (!nombre_completo || !nombre_completo.trim()) {
      return res.status(400).json({ error: "El nombre completo es obligatorio" });
    }

    const tipo = tipo_cliente ? tipo_cliente.toUpperCase() : "HABITUAL";
    if (!["HABITUAL", "NO_HABITUAL"].includes(tipo)) {
      return res.status(400).json({ error: "Tipo de cliente inválido" });
    }

    const anteriorResult = await pool.query(
      `SELECT * FROM clientes WHERE id_cliente = $1`,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const anterior = anteriorResult.rows[0];

    const query = `
      UPDATE clientes
      SET codigo_cliente = $1,
          nombre_completo = $2,
          nombre_empresa = $3,
          telefono = $4,
          telefono_secundario = $5,
          correo = $6,
          nit = $7,
          dpi = $8,
          direccion_principal = $9,
          tipo_cliente = $10,
          observaciones = $11,
          updated_by = $12,
          updated_at = NOW()
      WHERE id_cliente = $13
      RETURNING *;
    `;

    const values = [
      codigo_cliente?.trim() || null,
      nombre_completo.trim(),
      nombre_empresa?.trim() || null,
      telefono?.trim() || null,
      telefono_secundario?.trim() || null,
      correo?.trim() || null,
      nit?.trim() || null,
      dpi?.trim() || null,
      direccion_principal?.trim() || null,
      tipo,
      observaciones?.trim() || null,
      req.user?.id_usuario || null,
      id,
    ];

    const { rows } = await pool.query(query, values);
    const cliente = rows[0];

    await registrarAuditoria({
      tabla_afectada: "clientes",
      id_registro: cliente.id_cliente,
      accion: "ACTUALIZAR",
      descripcion: `Se actualizó el cliente ${cliente.nombre_completo}`,
      valores_anteriores: anterior,
      valores_nuevos: cliente,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(cliente);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "Ya existe un cliente con ese código u otro dato único",
      });
    }

    console.error("Error al actualizar cliente:", error);
    return res.status(500).json({ error: "Error interno al actualizar cliente" });
  }
};

export const cambiarEstadoCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !["ACTIVO", "INACTIVO"].includes(estado.toUpperCase())) {
      return res.status(400).json({ error: "Estado inválido. Use ACTIVO o INACTIVO" });
    }

    const anteriorResult = await pool.query(
      `SELECT * FROM clientes WHERE id_cliente = $1`,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const anterior = anteriorResult.rows[0];

    const query = `
      UPDATE clientes
      SET estado = $1,
          updated_by = $2,
          updated_at = NOW()
      WHERE id_cliente = $3
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      estado.toUpperCase(),
      req.user?.id_usuario || null,
      id,
    ]);

    const cliente = rows[0];

    await registrarAuditoria({
      tabla_afectada: "clientes",
      id_registro: cliente.id_cliente,
      accion: "CAMBIAR_ESTADO",
      descripcion: `Se cambió el estado del cliente ${cliente.nombre_completo} a ${cliente.estado}`,
      valores_anteriores: anterior,
      valores_nuevos: cliente,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(cliente);
  } catch (error) {
    console.error("Error al cambiar estado del cliente:", error);
    return res.status(500).json({ error: "Error interno al cambiar estado del cliente" });
  }
};