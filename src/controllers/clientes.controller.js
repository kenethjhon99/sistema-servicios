import { pool } from "../config/db.js";
import { apiErrorText } from "../i18n/apiMessages.js";
import { registrarAuditoria } from "../utils/auditoria.js";
import { hasPublicColumn } from "../utils/schema.js";
import { SUPPORTED_LANGS, DEFAULT_LANG } from "../utils/idioma.js";

const formatCodigoCliente = (idCliente) => `CL-${String(idCliente).padStart(6, "0")}`;

const getClienteSchemaSupport = async () => {
  const [
    soportaIdDocumento,
    soportaIdiomaPreferido,
    soportaCreatedBy,
    soportaUpdatedBy,
    soportaCodigoCliente,
  ] = await Promise.all([
    hasPublicColumn("clientes", "id_documento"),
    hasPublicColumn("clientes", "idioma_preferido"),
    hasPublicColumn("clientes", "created_by"),
    hasPublicColumn("clientes", "updated_by"),
    hasPublicColumn("clientes", "codigo_cliente"),
  ]);

  return {
    documentColumn: soportaIdDocumento ? "id_documento" : "dpi",
    soportaIdiomaPreferido,
    soportaCreatedBy,
    soportaUpdatedBy,
    soportaCodigoCliente,
  };
};

const normalizarCliente = (cliente) =>
  cliente
    ? {
        ...cliente,
        id_documento: cliente.id_documento ?? cliente.dpi ?? null,
      }
    : cliente;

const validarTipoCliente = (tipoCliente) => {
  const tipo = tipoCliente ? tipoCliente.toUpperCase() : "HABITUAL";
  if (!["HABITUAL", "NO_HABITUAL"].includes(tipo)) {
    return {
      errorEs: "Tipo de cliente invalido",
      errorEn: "Invalid client type",
    };
  }
  return { tipo };
};

const validarIdiomaCliente = (idiomaPreferido) => {
  const idioma = idiomaPreferido || DEFAULT_LANG;
  if (!SUPPORTED_LANGS.includes(idioma)) {
    return {
      errorEs: `Idioma preferido invalido. Use: ${SUPPORTED_LANGS.join(", ")}`,
      errorEn: `Invalid preferred language. Use: ${SUPPORTED_LANGS.join(", ")}`,
    };
  }
  return { idioma };
};

const construirSetDinamico = () => {
  const sets = [];
  const values = [];

  const pushSet = (column, value) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  return { sets, values, pushSet };
};

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
      id_documento,
      dpi,
      direccion_principal,
      tipo_cliente,
      observaciones,
      idioma_preferido,
    } = req.body;

    if (!nombre_completo || !nombre_completo.trim()) {
      return apiErrorText(
        res,
        req,
        400,
        "El nombre completo es obligatorio",
        "Full name is required"
      );
    }

    const { tipo, errorEs: tipoErrorEs, errorEn: tipoErrorEn } = validarTipoCliente(tipo_cliente);
    if (tipoErrorEs) {
      return apiErrorText(res, req, 400, tipoErrorEs, tipoErrorEn);
    }

    const { idioma, errorEs: idiomaErrorEs, errorEn: idiomaErrorEn } = validarIdiomaCliente(idioma_preferido);
    if (idiomaErrorEs) {
      return apiErrorText(res, req, 400, idiomaErrorEs, idiomaErrorEn);
    }

    const schema = await getClienteSchemaSupport();
    const documentValue = id_documento ?? dpi;
    const codigoManual = codigo_cliente?.trim() || null;

    const columns = [
      "nombre_completo",
      "nombre_empresa",
      "telefono",
      "telefono_secundario",
      "correo",
      "nit",
      schema.documentColumn,
      "direccion_principal",
      "tipo_cliente",
      "observaciones",
    ];

    const values = [
      nombre_completo.trim(),
      nombre_empresa?.trim() || null,
      telefono?.trim() || null,
      telefono_secundario?.trim() || null,
      correo?.trim() || null,
      nit?.trim() || null,
      documentValue?.trim() || null,
      direccion_principal?.trim() || null,
      tipo,
      observaciones?.trim() || null,
    ];

    if (schema.soportaCodigoCliente && codigoManual) {
      columns.unshift("codigo_cliente");
      values.unshift(codigoManual);
    }

    if (schema.soportaIdiomaPreferido) {
      columns.push("idioma_preferido");
      values.push(idioma);
    }

    if (schema.soportaCreatedBy) {
      columns.push("created_by");
      values.push(req.user?.id_usuario || null);
    }

    if (schema.soportaUpdatedBy) {
      columns.push("updated_by");
      values.push(req.user?.id_usuario || null);
    }

    const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
    const insertResult = await pool.query(
      `
        INSERT INTO clientes (${columns.join(", ")})
        VALUES (${placeholders})
        RETURNING *;
      `,
      values
    );

    let cliente = normalizarCliente(insertResult.rows[0]);

    if (schema.soportaCodigoCliente && !codigoManual) {
      const codigoGenerado = formatCodigoCliente(cliente.id_cliente);
      const updateCode = construirSetDinamico();
      updateCode.pushSet("codigo_cliente", codigoGenerado);

      if (schema.soportaUpdatedBy) {
        updateCode.pushSet("updated_by", req.user?.id_usuario || null);
      }

      updateCode.sets.push("updated_at = NOW()");
      updateCode.values.push(cliente.id_cliente);

      const codigoResult = await pool.query(
        `
          UPDATE clientes
          SET ${updateCode.sets.join(", ")}
          WHERE id_cliente = $${updateCode.values.length}
          RETURNING *;
        `,
        updateCode.values
      );

      cliente = normalizarCliente(codigoResult.rows[0]);
    }

    await registrarAuditoria({
      tabla_afectada: "clientes",
      id_registro: cliente.id_cliente,
      accion: "CREAR",
      descripcion: `Se creo el cliente ${cliente.nombre_completo}`,
      valores_nuevos: cliente,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.status(201).json(cliente);
  } catch (error) {
    if (error.code === "23505") {
      return apiErrorText(
        res,
        req,
        409,
        "Ya existe un cliente con ese codigo u otro dato unico",
        "A client with that code or another unique value already exists"
      );
    }

    console.error("Error al crear cliente:", error);
    return apiErrorText(res, req, 500, "Error interno al crear cliente", "Internal error while creating client");
  }
};

export const listarClientes = async (req, res) => {
  try {
    const { estado, tipo_cliente, busqueda } = req.query;
    const { page, limit, offset } = req.pagination || { page: 1, limit: 50, offset: 0 };
    const { documentColumn } = await getClienteSchemaSupport();

    let whereClause = " WHERE 1=1 ";
    const values = [];
    let index = 1;

    if (estado) {
      whereClause += ` AND estado = $${index}`;
      values.push(estado.toUpperCase());
      index++;
    }

    if (tipo_cliente) {
      whereClause += ` AND tipo_cliente = $${index}`;
      values.push(tipo_cliente.toUpperCase());
      index++;
    }

    if (busqueda) {
      whereClause += ` AND (
        nombre_completo ILIKE $${index}
        OR nombre_empresa ILIKE $${index}
        OR telefono ILIKE $${index}
        OR correo ILIKE $${index}
        OR nit ILIKE $${index}
      )`;
      values.push(`%${busqueda}%`);
      index++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM clientes ${whereClause}`,
      values
    );
    const total = countResult.rows[0].total;

    const dataQuery = `
      SELECT *, ${documentColumn} AS id_documento
      FROM clientes
      ${whereClause}
      ORDER BY id_cliente DESC
      LIMIT $${index} OFFSET $${index + 1}
    `;

    const { rows } = await pool.query(dataQuery, [...values, limit, offset]);

    return res.json({
      data: rows.map(normalizarCliente),
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error al listar clientes:", error);
    return apiErrorText(res, req, 500, "Error interno al listar clientes", "Internal error while listing clients");
  }
};

export const obtenerClientePorId = async (req, res) => {
  try {
    const { id } = req.params;
    const { documentColumn } = await getClienteSchemaSupport();

    const { rows } = await pool.query(
      `
        SELECT *, ${documentColumn} AS id_documento
        FROM clientes
        WHERE id_cliente = $1;
      `,
      [id]
    );

    if (rows.length === 0) {
      return apiErrorText(res, req, 404, "Cliente no encontrado", "Client not found");
    }

    return res.json(normalizarCliente(rows[0]));
  } catch (error) {
    console.error("Error al obtener cliente:", error);
    return apiErrorText(res, req, 500, "Error interno al obtener cliente", "Internal error while loading client");
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
      id_documento,
      dpi,
      direccion_principal,
      tipo_cliente,
      observaciones,
      idioma_preferido,
    } = req.body;

    if (!nombre_completo || !nombre_completo.trim()) {
      return apiErrorText(
        res,
        req,
        400,
        "El nombre completo es obligatorio",
        "Full name is required"
      );
    }

    const { tipo, errorEs: tipoErrorEs, errorEn: tipoErrorEn } = validarTipoCliente(tipo_cliente);
    if (tipoErrorEs) {
      return apiErrorText(res, req, 400, tipoErrorEs, tipoErrorEn);
    }

    const { idioma, errorEs: idiomaErrorEs, errorEn: idiomaErrorEn } = validarIdiomaCliente(idioma_preferido);
    if (idiomaErrorEs) {
      return apiErrorText(res, req, 400, idiomaErrorEs, idiomaErrorEn);
    }

    const anteriorResult = await pool.query(`SELECT * FROM clientes WHERE id_cliente = $1`, [id]);

    if (anteriorResult.rows.length === 0) {
      return apiErrorText(res, req, 404, "Cliente no encontrado", "Client not found");
    }

    const anterior = anteriorResult.rows[0];
    const schema = await getClienteSchemaSupport();
    const documentValue = id_documento ?? dpi;
    const codigoFinal =
      codigo_cliente?.trim() ||
      anterior.codigo_cliente ||
      formatCodigoCliente(anterior.id_cliente);

    const update = construirSetDinamico();

    if (schema.soportaCodigoCliente) {
      update.pushSet("codigo_cliente", codigoFinal);
    }

    update.pushSet("nombre_completo", nombre_completo.trim());
    update.pushSet("nombre_empresa", nombre_empresa?.trim() || null);
    update.pushSet("telefono", telefono?.trim() || null);
    update.pushSet("telefono_secundario", telefono_secundario?.trim() || null);
    update.pushSet("correo", correo?.trim() || null);
    update.pushSet("nit", nit?.trim() || null);
    update.pushSet(schema.documentColumn, documentValue?.trim() || null);
    update.pushSet("direccion_principal", direccion_principal?.trim() || null);
    update.pushSet("tipo_cliente", tipo);
    update.pushSet("observaciones", observaciones?.trim() || null);

    if (schema.soportaIdiomaPreferido) {
      update.pushSet("idioma_preferido", idioma);
    }

    if (schema.soportaUpdatedBy) {
      update.pushSet("updated_by", req.user?.id_usuario || null);
    }

    update.sets.push("updated_at = NOW()");
    update.values.push(id);

    const { rows } = await pool.query(
      `
        UPDATE clientes
        SET ${update.sets.join(", ")}
        WHERE id_cliente = $${update.values.length}
        RETURNING *;
      `,
      update.values
    );

    const cliente = normalizarCliente(rows[0]);

    await registrarAuditoria({
      tabla_afectada: "clientes",
      id_registro: cliente.id_cliente,
      accion: "ACTUALIZAR",
      descripcion: `Se actualizo el cliente ${cliente.nombre_completo}`,
      valores_anteriores: anterior,
      valores_nuevos: cliente,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(cliente);
  } catch (error) {
    if (error.code === "23505") {
      return apiErrorText(
        res,
        req,
        409,
        "Ya existe un cliente con ese codigo u otro dato unico",
        "A client with that code or another unique value already exists"
      );
    }

    console.error("Error al actualizar cliente:", error);
    return apiErrorText(res, req, 500, "Error interno al actualizar cliente", "Internal error while updating client");
  }
};

export const cambiarEstadoCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !["ACTIVO", "INACTIVO"].includes(estado.toUpperCase())) {
      return apiErrorText(
        res,
        req,
        400,
        "Estado invalido. Use ACTIVO o INACTIVO",
        "Invalid status. Use ACTIVO or INACTIVO"
      );
    }

    const anteriorResult = await pool.query(`SELECT * FROM clientes WHERE id_cliente = $1`, [id]);

    if (anteriorResult.rows.length === 0) {
      return apiErrorText(res, req, 404, "Cliente no encontrado", "Client not found");
    }

    const anterior = anteriorResult.rows[0];
    const { soportaUpdatedBy } = await getClienteSchemaSupport();
    const update = construirSetDinamico();
    update.pushSet("estado", estado.toUpperCase());

    if (soportaUpdatedBy) {
      update.pushSet("updated_by", req.user?.id_usuario || null);
    }

    update.sets.push("updated_at = NOW()");
    update.values.push(id);

    const { rows } = await pool.query(
      `
        UPDATE clientes
        SET ${update.sets.join(", ")}
        WHERE id_cliente = $${update.values.length}
        RETURNING *;
      `,
      update.values
    );

    const cliente = normalizarCliente(rows[0]);

    await registrarAuditoria({
      tabla_afectada: "clientes",
      id_registro: cliente.id_cliente,
      accion: "CAMBIAR_ESTADO",
      descripcion: `Se cambio el estado del cliente ${cliente.nombre_completo} a ${cliente.estado}`,
      valores_anteriores: anterior,
      valores_nuevos: cliente,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(cliente);
  } catch (error) {
    console.error("Error al cambiar estado del cliente:", error);
    return apiErrorText(
      res,
      req,
      500,
      "Error interno al cambiar estado del cliente",
      "Internal error while changing client status"
    );
  }
};
