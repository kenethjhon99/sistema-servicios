import { pool } from "../config/db.js";
import { apiErrorText, localizeInlineText } from "../i18n/apiMessages.js";
import { registrarAuditoria } from "../utils/auditoria.js";
import { hasPublicColumn } from "../utils/schema.js";

const FRECUENCIAS_VALIDAS = ["UNICA", "SEMANAL", "QUINCENAL", "MENSUAL"];
const PRIORIDADES_VALIDAS = ["BAJA", "MEDIA", "ALTA", "URGENTE"];
const ESTADOS_VALIDOS = ["ACTIVA", "PAUSADA", "FINALIZADA", "CANCELADA"];
const ESTADOS_EJECUCION_VALIDOS = [
  "PENDIENTE",
  "REPROGRAMADA",
  "CANCELADA",
  "COMPLETADA",
  "GENERADA",
];
const CODIGOS_ERROR_ESQUEMA = new Set(["42601", "42703", "42P01"]);

const generarNumeroOrdenProgramada = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");

  return `OT-${y}${m}${d}-${h}${min}${s}`;
};

const obtenerProgramacionResumen = async (executor, idProgramacion) => {
  const result = await executor.query(
    `
      SELECT
        id_programacion,
        proxima_fecha,
        hora_programada,
        estado
      FROM programaciones_servicio
      WHERE id_programacion = $1
    `,
    [idProgramacion]
  );

  return result.rows[0] || null;
};

const obtenerEjecucionPorId = async (executor, idEjecucion) => {
  const result = await executor.query(
    `
      SELECT
        pe.*,
        ps.estado AS estado_programacion,
        ps.hora_programada AS hora_programada_base
      FROM programaciones_ejecuciones pe
      INNER JOIN programaciones_servicio ps
        ON ps.id_programacion = pe.id_programacion
      WHERE pe.id_ejecucion = $1
    `,
    [idEjecucion]
  );

  return result.rows[0] || null;
};

const obtenerEjecucionParaOrden = async (executor, idEjecucion, soportaEmpleadoResponsable) => {
  const result = await executor.query(
    `
      SELECT
        pe.*,
        ps.id_cliente,
        ps.id_propiedad,
        ps.id_servicio,
        ps.id_cuadrilla,
        ps.frecuencia,
        ps.proxima_fecha,
        ps.hora_programada AS hora_programada_base,
        ps.duracion_estimada_min,
        ps.precio_acordado,
        ps.descripcion_precio,
        ps.observaciones AS observaciones_programacion,
        ps.estado AS estado_programacion,
        ${
          soportaEmpleadoResponsable
            ? "ps.id_empleado_responsable,"
            : "NULL::bigint AS id_empleado_responsable,"
        }
        s.nombre AS servicio,
        e.estado AS estado_empleado_responsable
      FROM programaciones_ejecuciones pe
      INNER JOIN programaciones_servicio ps
        ON ps.id_programacion = pe.id_programacion
      INNER JOIN servicios s
        ON ps.id_servicio = s.id_servicio
      LEFT JOIN empleados e
        ON ${
          soportaEmpleadoResponsable
            ? "ps.id_empleado_responsable = e.id_empleado"
            : "FALSE"
        }
      WHERE pe.id_ejecucion = $1
      LIMIT 1
    `,
    [idEjecucion]
  );

  return result.rows[0] || null;
};

const buscarEjecucionDuplicada = async (executor, idProgramacion, fechaProgramada) => {
  const result = await executor.query(
    `
      SELECT id_ejecucion
      FROM programaciones_ejecuciones
      WHERE id_programacion = $1
        AND fecha_programada = $2
        AND estado IN ('PENDIENTE', 'GENERADA')
      LIMIT 1
    `,
    [idProgramacion, fechaProgramada]
  );

  return result.rows[0] || null;
};

const validarDisponibilidadResponsableOrdenGenerada = async (
  req,
  executor,
  idEmpleadoResponsable,
  fechaServicio
) => {
  if (!idEmpleadoResponsable || !fechaServicio) {
    return { ok: true };
  }

  const conflictoResult = await executor.query(
    `
      SELECT ot.numero_orden
      FROM ordenes_empleados oe
      INNER JOIN ordenes_trabajo ot
        ON oe.id_orden_trabajo = ot.id_orden_trabajo
      WHERE oe.id_empleado = $1
        AND ot.fecha_servicio = $2
        AND ot.estado <> 'CANCELADA'
      LIMIT 1
    `,
    [idEmpleadoResponsable, fechaServicio]
  );

  if (conflictoResult.rows.length > 0) {
    return {
      ok: false,
      status: 409,
      error: localizeInlineText(
        req,
        `El responsable asignado ya tiene la orden ${conflictoResult.rows[0].numero_orden} para esa fecha`,
        `The assigned staff member already has order ${conflictoResult.rows[0].numero_orden} for that date`
      ),
    };
  }

  return { ok: true };
};

const construirWhereProgramaciones = ({
  estado,
  frecuencia,
  prioridad,
  id_cliente,
  id_propiedad,
  id_servicio,
  id_empleado_responsable,
  fecha_desde,
  fecha_hasta,
  soportaEmpleadoResponsable,
}) => {
  let whereClause = ` WHERE 1=1 `;
  const values = [];
  let index = 1;

  if (estado) {
    whereClause += ` AND ps.estado = $${index}`;
    values.push(estado.toUpperCase());
    index++;
  }

  if (frecuencia) {
    whereClause += ` AND ps.frecuencia = $${index}`;
    values.push(frecuencia.toUpperCase());
    index++;
  }

  if (prioridad) {
    whereClause += ` AND ps.prioridad = $${index}`;
    values.push(prioridad.toUpperCase());
    index++;
  }

  if (id_cliente) {
    whereClause += ` AND ps.id_cliente = $${index}`;
    values.push(id_cliente);
    index++;
  }

  if (id_propiedad) {
    whereClause += ` AND ps.id_propiedad = $${index}`;
    values.push(id_propiedad);
    index++;
  }

  if (id_servicio) {
    whereClause += ` AND ps.id_servicio = $${index}`;
    values.push(id_servicio);
    index++;
  }

  if (id_empleado_responsable && soportaEmpleadoResponsable) {
    whereClause += ` AND ps.id_empleado_responsable = $${index}`;
    values.push(id_empleado_responsable);
    index++;
  }

  if (fecha_desde) {
    whereClause += ` AND ps.proxima_fecha >= $${index}`;
    values.push(fecha_desde);
    index++;
  }

  if (fecha_hasta) {
    whereClause += ` AND ps.proxima_fecha <= $${index}`;
    values.push(fecha_hasta);
    index++;
  }

  return { whereClause, values, index };
};

const consultarListadoProgramaciones = async ({
  estado,
  frecuencia,
  prioridad,
  id_cliente,
  id_propiedad,
  id_servicio,
  id_empleado_responsable,
  fecha_desde,
  fecha_hasta,
  page,
  limit,
  offset,
  soportaEmpleadoResponsable,
  soportaEjecucionesProgramacion,
}) => {
  const { whereClause, values, index } = construirWhereProgramaciones({
    estado,
    frecuencia,
    prioridad,
    id_cliente,
    id_propiedad,
    id_servicio,
    id_empleado_responsable,
    fecha_desde,
    fecha_hasta,
    soportaEmpleadoResponsable,
  });

  const countResult = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM programaciones_servicio ps
      INNER JOIN clientes c ON ps.id_cliente = c.id_cliente
      INNER JOIN propiedades p ON ps.id_propiedad = p.id_propiedad
      INNER JOIN servicios s ON ps.id_servicio = s.id_servicio
      INNER JOIN categorias_servicio cs ON s.id_categoria_servicio = cs.id_categoria_servicio
      LEFT JOIN cuadrillas cu ON ps.id_cuadrilla = cu.id_cuadrilla
      ${
        soportaEmpleadoResponsable
          ? "LEFT JOIN empleados e ON ps.id_empleado_responsable = e.id_empleado"
          : ""
      }
      ${whereClause}
    `,
    values
  );
  const total = countResult.rows[0].total;

  const dataQuery = `
    SELECT
      ps.*,
      c.nombre_completo AS cliente,
      p.nombre_propiedad,
      s.nombre AS servicio,
      cs.nombre AS categoria_servicio,
      cu.nombre AS cuadrilla,
      ${
        soportaEjecucionesProgramacion
          ? `
      ultima_ejecucion.fecha_programada AS ultima_ejecucion_fecha,
      ultima_ejecucion.estado AS ultima_ejecucion_estado,
      visita_actual.id_ejecucion AS id_ejecucion_actual,
      visita_actual.estado AS estado_visita_actual,
      `
          : `
      NULL::date AS ultima_ejecucion_fecha,
      NULL::varchar AS ultima_ejecucion_estado,
      NULL::bigint AS id_ejecucion_actual,
      NULL::varchar AS estado_visita_actual,
      `
      }
      ${
        soportaEmpleadoResponsable
          ? "e.nombre_completo AS empleado_responsable"
          : "NULL::varchar AS empleado_responsable"
      }
    FROM programaciones_servicio ps
    INNER JOIN clientes c
      ON ps.id_cliente = c.id_cliente
    INNER JOIN propiedades p
      ON ps.id_propiedad = p.id_propiedad
    INNER JOIN servicios s
      ON ps.id_servicio = s.id_servicio
    INNER JOIN categorias_servicio cs
      ON s.id_categoria_servicio = cs.id_categoria_servicio
    LEFT JOIN cuadrillas cu
      ON ps.id_cuadrilla = cu.id_cuadrilla
    ${
      soportaEjecucionesProgramacion
        ? `
    LEFT JOIN LATERAL (
      SELECT
        pe.id_ejecucion,
        pe.fecha_programada,
        pe.estado
      FROM programaciones_ejecuciones pe
      WHERE pe.id_programacion = ps.id_programacion
      ORDER BY pe.fecha_programada DESC, pe.id_ejecucion DESC
      LIMIT 1
    ) AS ultima_ejecucion
      ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        pe.id_ejecucion,
        pe.estado
      FROM programaciones_ejecuciones pe
      WHERE pe.id_programacion = ps.id_programacion
        AND pe.fecha_programada = ps.proxima_fecha
        AND pe.estado IN ('PENDIENTE', 'GENERADA')
      ORDER BY pe.id_ejecucion DESC
      LIMIT 1
    ) AS visita_actual
      ON TRUE
    `
        : ""
    }
    ${
      soportaEmpleadoResponsable
        ? "LEFT JOIN empleados e ON ps.id_empleado_responsable = e.id_empleado"
        : ""
    }
    ${whereClause}
    ORDER BY ps.proxima_fecha ASC, ps.id_programacion DESC
    LIMIT $${index} OFFSET $${index + 1}
  `;

  const { rows } = await pool.query(dataQuery, [...values, limit, offset]);

  return {
    data: rows,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
};

const validarEmpleadoResponsable = async (req, id_empleado_responsable, id_cuadrilla) => {
  if (!id_empleado_responsable) {
    return { ok: true, empleado: null };
  }

  const empleadoResult = await pool.query(
    `SELECT id_empleado, id_cuadrilla, estado FROM empleados WHERE id_empleado = $1`,
    [id_empleado_responsable]
  );

  if (empleadoResult.rows.length === 0) {
    return {
      ok: false,
      status: 404,
      error: localizeInlineText(req, "El responsable asignado no existe", "Assigned staff member does not exist"),
    };
  }

  const empleado = empleadoResult.rows[0];

  if (empleado.estado !== "ACTIVO") {
    return {
      ok: false,
      status: 400,
      error: localizeInlineText(req, "No se puede asignar un empleado inactivo", "Cannot assign an inactive employee"),
    };
  }

  if (
    id_cuadrilla &&
    empleado.id_cuadrilla &&
    Number(empleado.id_cuadrilla) !== Number(id_cuadrilla)
  ) {
    return {
      ok: false,
      status: 400,
      error: localizeInlineText(
        req,
        "El responsable asignado no pertenece al grupo seleccionado",
        "The assigned staff member does not belong to the selected group"
      ),
    };
  }

  return { ok: true, empleado };
};

const validarDisponibilidadEmpleadoProgramacion = async (
  req,
  id_empleado_responsable,
  proxima_fecha,
  excludeProgramacionId = null
) => {
  const soportaEmpleadoResponsable = await hasPublicColumn(
    "programaciones_servicio",
    "id_empleado_responsable"
  );

  if (!soportaEmpleadoResponsable) {
    return { ok: true };
  }

  if (!id_empleado_responsable) {
    return { ok: true };
  }

  const conflictoResult = await pool.query(
    `
      SELECT id_programacion
      FROM programaciones_servicio
      WHERE id_empleado_responsable = $1
        AND proxima_fecha = $2
        AND estado = 'ACTIVA'
        AND ($3::bigint IS NULL OR id_programacion <> $3)
      LIMIT 1
    `,
    [id_empleado_responsable, proxima_fecha, excludeProgramacionId]
  );

  if (conflictoResult.rows.length > 0) {
    return {
      ok: false,
      status: 409,
      error: localizeInlineText(
        req,
        `El responsable asignado ya tiene una programacion activa para la fecha ${proxima_fecha}`,
        `The assigned staff member already has an active schedule for ${proxima_fecha}`
      ),
    };
  }

  return { ok: true };
};

export const crearProgramacion = async (req, res) => {
  try {
    const {
      id_cliente,
      id_propiedad,
      id_servicio,
      id_cuadrilla,
      id_empleado_responsable,
      frecuencia,
      fecha_inicio,
      hora_programada,
      proxima_fecha,
      duracion_estimada_min,
      precio_acordado,
      descripcion_precio,
      prioridad,
      observaciones,
    } = req.body;
    const soportaEmpleadoResponsable = await hasPublicColumn(
      "programaciones_servicio",
      "id_empleado_responsable"
    );
    const empleadoResponsableFinal = soportaEmpleadoResponsable
      ? id_empleado_responsable || null
      : null;

    if (!id_cliente) {
      return apiErrorText(res, req, 400, "El cliente es obligatorio", "Client is required");
    }

    if (!id_propiedad) {
      return apiErrorText(res, req, 400, "La propiedad es obligatoria", "Property is required");
    }

    if (!id_servicio) {
      return apiErrorText(res, req, 400, "El servicio es obligatorio", "Service is required");
    }

    if (!frecuencia || !FRECUENCIAS_VALIDAS.includes(frecuencia.toUpperCase())) {
      return res.status(400).json({ error: "Frecuencia inválida" });
    }

    if (!fecha_inicio) {
      return res.status(400).json({ error: "La fecha de inicio es obligatoria" });
    }

    if (!proxima_fecha) {
      return res.status(400).json({ error: "La próxima fecha es obligatoria" });
    }

    if (!duracion_estimada_min || Number(duracion_estimada_min) <= 0) {
      return res.status(400).json({ error: "La duración estimada debe ser mayor a 0" });
    }

    if (precio_acordado === undefined || precio_acordado === null || Number(precio_acordado) < 0) {
      return res.status(400).json({ error: "El precio acordado es obligatorio y no puede ser negativo" });
    }

    const prioridadFinal = prioridad ? prioridad.toUpperCase() : "MEDIA";
    if (!PRIORIDADES_VALIDAS.includes(prioridadFinal)) {
      return res.status(400).json({ error: "Prioridad inválida" });
    }

    const clienteResult = await pool.query(
      `SELECT id_cliente, estado
       FROM clientes
       WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({ error: "El cliente no existe" });
    }

    if (clienteResult.rows[0].estado !== "ACTIVO") {
      return res.status(400).json({ error: "No se puede programar para un cliente inactivo" });
    }

    const propiedadResult = await pool.query(
      `SELECT id_propiedad, id_cliente, estado
       FROM propiedades
       WHERE id_propiedad = $1`,
      [id_propiedad]
    );

    if (propiedadResult.rows.length === 0) {
      return res.status(404).json({ error: "La propiedad no existe" });
    }

    if (propiedadResult.rows[0].estado !== "ACTIVA") {
      return res.status(400).json({ error: "No se puede programar sobre una propiedad inactiva" });
    }

    if (Number(propiedadResult.rows[0].id_cliente) !== Number(id_cliente)) {
      return res.status(400).json({ error: "La propiedad no pertenece al cliente seleccionado" });
    }

    const servicioResult = await pool.query(
      `SELECT id_servicio, estado
       FROM servicios
       WHERE id_servicio = $1`,
      [id_servicio]
    );

    if (servicioResult.rows.length === 0) {
      return res.status(404).json({ error: "El servicio no existe" });
    }

    if (servicioResult.rows[0].estado !== "ACTIVO") {
      return res.status(400).json({ error: "No se puede usar un servicio inactivo" });
    }

    if (id_cuadrilla) {
      const cuadrillaResult = await pool.query(
        `SELECT id_cuadrilla, estado
         FROM cuadrillas
         WHERE id_cuadrilla = $1`,
        [id_cuadrilla]
      );

      if (cuadrillaResult.rows.length === 0) {
        return res.status(404).json({ error: "La cuadrilla seleccionada no existe" });
      }

      if (cuadrillaResult.rows[0].estado !== "ACTIVA") {
        return res.status(400).json({ error: "No se puede asignar una cuadrilla inactiva" });
      }
    }

    const empleadoValidacion = await validarEmpleadoResponsable(
      req,
      empleadoResponsableFinal,
      id_cuadrilla
    );
    if (!empleadoValidacion.ok) {
      return res.status(empleadoValidacion.status).json({ error: empleadoValidacion.error });
    }

    const disponibilidadEmpleado = await validarDisponibilidadEmpleadoProgramacion(
      req,
      empleadoResponsableFinal,
      proxima_fecha
    );
    if (!disponibilidadEmpleado.ok) {
      return res.status(disponibilidadEmpleado.status).json({ error: disponibilidadEmpleado.error });
    }

    const query = soportaEmpleadoResponsable
      ? `
        INSERT INTO programaciones_servicio (
          id_cliente,
          id_propiedad,
          id_servicio,
          id_cuadrilla,
          id_empleado_responsable,
          frecuencia,
          fecha_inicio,
          hora_programada,
          proxima_fecha,
          duracion_estimada_min,
          precio_acordado,
          descripcion_precio,
          prioridad,
          observaciones,
          created_by,
          updated_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING *;
      `
      : `
        INSERT INTO programaciones_servicio (
          id_cliente,
          id_propiedad,
          id_servicio,
          id_cuadrilla,
          frecuencia,
          fecha_inicio,
          hora_programada,
          proxima_fecha,
          duracion_estimada_min,
          precio_acordado,
          descripcion_precio,
          prioridad,
          observaciones,
          created_by,
          updated_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING *;
      `;

    const values = soportaEmpleadoResponsable
      ? [
          id_cliente,
          id_propiedad,
          id_servicio,
          id_cuadrilla || null,
          empleadoResponsableFinal,
          frecuencia.toUpperCase(),
          fecha_inicio,
          hora_programada || null,
          proxima_fecha,
          Number(duracion_estimada_min),
          Number(precio_acordado),
          descripcion_precio?.trim() || null,
          prioridadFinal,
          observaciones?.trim() || null,
          req.user?.id_usuario || null,
          req.user?.id_usuario || null,
        ]
      : [
          id_cliente,
          id_propiedad,
          id_servicio,
          id_cuadrilla || null,
          frecuencia.toUpperCase(),
          fecha_inicio,
          hora_programada || null,
          proxima_fecha,
          Number(duracion_estimada_min),
          Number(precio_acordado),
          descripcion_precio?.trim() || null,
          prioridadFinal,
          observaciones?.trim() || null,
          req.user?.id_usuario || null,
          req.user?.id_usuario || null,
        ];

    const { rows } = await pool.query(query, values);
    const programacion = rows[0];

    await registrarAuditoria({
      tabla_afectada: "programaciones_servicio",
      id_registro: programacion.id_programacion,
      accion: "CREAR",
      descripcion: `Se creó la programación ${programacion.id_programacion}`,
      valores_nuevos: programacion,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.status(201).json(programacion);
  } catch (error) {
    console.error("Error al crear programación:", error);
    return apiErrorText(res, req, 500, "Error interno al crear programación", "Internal error while creating schedule");
  }
};

export const listarProgramaciones = async (req, res) => {
  try {
    const {
      estado,
      frecuencia,
      prioridad,
      id_cliente,
      id_propiedad,
      id_servicio,
      id_empleado_responsable,
      fecha_desde,
      fecha_hasta,
    } = req.query;

    const { page, limit, offset } = req.pagination || { page: 1, limit: 50, offset: 0 };
    const soportaEmpleadoResponsable = await hasPublicColumn(
      "programaciones_servicio",
      "id_empleado_responsable"
    );
    const soportaEjecucionesProgramacion = await hasPublicColumn(
      "programaciones_ejecuciones",
      "id_ejecucion"
    );
    const result = await consultarListadoProgramaciones({
      estado,
      frecuencia,
      prioridad,
      id_cliente,
      id_propiedad,
      id_servicio,
      id_empleado_responsable,
      fecha_desde,
      fecha_hasta,
      page,
      limit,
      offset,
      soportaEmpleadoResponsable,
      soportaEjecucionesProgramacion,
    });

    return res.json(result);
  } catch (error) {
    if (CODIGOS_ERROR_ESQUEMA.has(error.code)) {
      try {
        const {
          estado,
          frecuencia,
          prioridad,
          id_cliente,
          id_propiedad,
          id_servicio,
          fecha_desde,
          fecha_hasta,
        } = req.query;
        const { page, limit, offset } = req.pagination || {
          page: 1,
          limit: 50,
          offset: 0,
        };

        const result = await consultarListadoProgramaciones({
          estado,
          frecuencia,
          prioridad,
          id_cliente,
          id_propiedad,
          id_servicio,
          id_empleado_responsable: null,
          fecha_desde,
          fecha_hasta,
          page,
          limit,
          offset,
          soportaEmpleadoResponsable: false,
          soportaEjecucionesProgramacion: false,
        });

        return res.json(result);
      } catch (fallbackError) {
        console.error("Fallback al listar programaciones:", fallbackError);
      }
    }

    console.error("Error al listar programaciones:", error);
    return apiErrorText(res, req, 500, "Error interno al listar programaciones", "Internal error while listing schedules");
  }
};

export const obtenerProgramacionPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const soportaEmpleadoResponsable = await hasPublicColumn(
      "programaciones_servicio",
      "id_empleado_responsable"
    );

    const query = `
      SELECT
        ps.*,
        c.nombre_completo AS cliente,
        p.nombre_propiedad,
        s.nombre AS servicio,
        cs.nombre AS categoria_servicio,
        cu.nombre AS cuadrilla,
        ${
          soportaEmpleadoResponsable
            ? "e.nombre_completo AS empleado_responsable"
            : "NULL::varchar AS empleado_responsable"
        }
      FROM programaciones_servicio ps
      INNER JOIN clientes c
        ON ps.id_cliente = c.id_cliente
      INNER JOIN propiedades p
        ON ps.id_propiedad = p.id_propiedad
      INNER JOIN servicios s
        ON ps.id_servicio = s.id_servicio
      INNER JOIN categorias_servicio cs
        ON s.id_categoria_servicio = cs.id_categoria_servicio
      LEFT JOIN cuadrillas cu
        ON ps.id_cuadrilla = cu.id_cuadrilla
      ${
        soportaEmpleadoResponsable
          ? "LEFT JOIN empleados e ON ps.id_empleado_responsable = e.id_empleado"
          : ""
      }
      WHERE ps.id_programacion = $1;
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return apiErrorText(res, req, 404, "Programación no encontrada", "Schedule not found");
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener programación:", error);
    return apiErrorText(res, req, 500, "Error interno al obtener programación", "Internal error while loading schedule");
  }
};

export const actualizarProgramacion = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      id_cliente,
      id_propiedad,
      id_servicio,
      id_cuadrilla,
      id_empleado_responsable,
      frecuencia,
      fecha_inicio,
      hora_programada,
      proxima_fecha,
      duracion_estimada_min,
      precio_acordado,
      descripcion_precio,
      prioridad,
      observaciones,
      motivo_cancelacion,
    } = req.body;
    const soportaEmpleadoResponsable = await hasPublicColumn(
      "programaciones_servicio",
      "id_empleado_responsable"
    );
    const empleadoResponsableFinal = soportaEmpleadoResponsable
      ? id_empleado_responsable || null
      : null;

    if (!id_cliente) {
      return res.status(400).json({ error: "El cliente es obligatorio" });
    }

    if (!id_propiedad) {
      return res.status(400).json({ error: "La propiedad es obligatoria" });
    }

    if (!id_servicio) {
      return res.status(400).json({ error: "El servicio es obligatorio" });
    }

    if (!frecuencia || !FRECUENCIAS_VALIDAS.includes(frecuencia.toUpperCase())) {
      return res.status(400).json({ error: "Frecuencia inválida" });
    }

    if (!fecha_inicio) {
      return res.status(400).json({ error: "La fecha de inicio es obligatoria" });
    }

    if (!proxima_fecha) {
      return res.status(400).json({ error: "La próxima fecha es obligatoria" });
    }

    if (!duracion_estimada_min || Number(duracion_estimada_min) <= 0) {
      return res.status(400).json({ error: "La duración estimada debe ser mayor a 0" });
    }

    if (precio_acordado === undefined || precio_acordado === null || Number(precio_acordado) < 0) {
      return res.status(400).json({ error: "El precio acordado es obligatorio y no puede ser negativo" });
    }

    const prioridadFinal = prioridad ? prioridad.toUpperCase() : "MEDIA";
    if (!PRIORIDADES_VALIDAS.includes(prioridadFinal)) {
      return res.status(400).json({ error: "Prioridad inválida" });
    }

    const anteriorResult = await pool.query(
      `SELECT * FROM programaciones_servicio WHERE id_programacion = $1`,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return res.status(404).json({ error: "Programación no encontrada" });
    }

    const anterior = anteriorResult.rows[0];

    const clienteResult = await pool.query(
      `SELECT id_cliente, estado
       FROM clientes
       WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({ error: "El cliente no existe" });
    }

    if (clienteResult.rows[0].estado !== "ACTIVO") {
      return res.status(400).json({ error: "No se puede usar un cliente inactivo" });
    }

    const propiedadResult = await pool.query(
      `SELECT id_propiedad, id_cliente, estado
       FROM propiedades
       WHERE id_propiedad = $1`,
      [id_propiedad]
    );

    if (propiedadResult.rows.length === 0) {
      return res.status(404).json({ error: "La propiedad no existe" });
    }

    if (propiedadResult.rows[0].estado !== "ACTIVA") {
      return res.status(400).json({ error: "No se puede usar una propiedad inactiva" });
    }

    if (Number(propiedadResult.rows[0].id_cliente) !== Number(id_cliente)) {
      return res.status(400).json({ error: "La propiedad no pertenece al cliente seleccionado" });
    }

    const servicioResult = await pool.query(
      `SELECT id_servicio, estado
       FROM servicios
       WHERE id_servicio = $1`,
      [id_servicio]
    );

    if (servicioResult.rows.length === 0) {
      return res.status(404).json({ error: "El servicio no existe" });
    }

    if (servicioResult.rows[0].estado !== "ACTIVO") {
      return res.status(400).json({ error: "No se puede usar un servicio inactivo" });
    }

    if (id_cuadrilla) {
      const cuadrillaResult = await pool.query(
        `SELECT id_cuadrilla, estado
         FROM cuadrillas
         WHERE id_cuadrilla = $1`,
        [id_cuadrilla]
      );

      if (cuadrillaResult.rows.length === 0) {
        return res.status(404).json({ error: "La cuadrilla seleccionada no existe" });
      }

      if (cuadrillaResult.rows[0].estado !== "ACTIVA") {
        return res.status(400).json({ error: "No se puede asignar una cuadrilla inactiva" });
      }
    }

    const empleadoValidacion = await validarEmpleadoResponsable(
      req,
      empleadoResponsableFinal,
      id_cuadrilla
    );
    if (!empleadoValidacion.ok) {
      return res.status(empleadoValidacion.status).json({ error: empleadoValidacion.error });
    }

    const disponibilidadEmpleado = await validarDisponibilidadEmpleadoProgramacion(
      req,
      empleadoResponsableFinal,
      proxima_fecha,
      Number(id)
    );
    if (!disponibilidadEmpleado.ok) {
      return res.status(disponibilidadEmpleado.status).json({ error: disponibilidadEmpleado.error });
    }

    const query = soportaEmpleadoResponsable
      ? `
        UPDATE programaciones_servicio
        SET id_cliente = $1,
            id_propiedad = $2,
            id_servicio = $3,
            id_cuadrilla = $4,
            id_empleado_responsable = $5,
            frecuencia = $6,
            fecha_inicio = $7,
            hora_programada = $8,
            proxima_fecha = $9,
            duracion_estimada_min = $10,
            precio_acordado = $11,
            descripcion_precio = $12,
            prioridad = $13,
            observaciones = $14,
            motivo_cancelacion = $15,
            updated_by = $16,
            updated_at = NOW()
        WHERE id_programacion = $17
        RETURNING *;
      `
      : `
        UPDATE programaciones_servicio
        SET id_cliente = $1,
            id_propiedad = $2,
            id_servicio = $3,
            id_cuadrilla = $4,
            frecuencia = $5,
            fecha_inicio = $6,
            hora_programada = $7,
            proxima_fecha = $8,
            duracion_estimada_min = $9,
            precio_acordado = $10,
            descripcion_precio = $11,
            prioridad = $12,
            observaciones = $13,
            motivo_cancelacion = $14,
            updated_by = $15,
            updated_at = NOW()
        WHERE id_programacion = $16
        RETURNING *;
      `;

    const values = soportaEmpleadoResponsable
      ? [
          id_cliente,
          id_propiedad,
          id_servicio,
          id_cuadrilla || null,
          empleadoResponsableFinal,
          frecuencia.toUpperCase(),
          fecha_inicio,
          hora_programada || null,
          proxima_fecha,
          Number(duracion_estimada_min),
          Number(precio_acordado),
          descripcion_precio?.trim() || null,
          prioridadFinal,
          observaciones?.trim() || null,
          motivo_cancelacion?.trim() || null,
          req.user?.id_usuario || null,
          id,
        ]
      : [
          id_cliente,
          id_propiedad,
          id_servicio,
          id_cuadrilla || null,
          frecuencia.toUpperCase(),
          fecha_inicio,
          hora_programada || null,
          proxima_fecha,
          Number(duracion_estimada_min),
          Number(precio_acordado),
          descripcion_precio?.trim() || null,
          prioridadFinal,
          observaciones?.trim() || null,
          motivo_cancelacion?.trim() || null,
          req.user?.id_usuario || null,
          id,
        ];

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return apiErrorText(res, req, 404, "Programación no encontrada", "Schedule not found");
    }

    const programacion = rows[0];

    await registrarAuditoria({
      tabla_afectada: "programaciones_servicio",
      id_registro: programacion.id_programacion,
      accion: "ACTUALIZAR",
      descripcion: `Se actualizó la programación ${programacion.id_programacion}`,
      valores_anteriores: anterior,
      valores_nuevos: programacion,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(programacion);
  } catch (error) {
    console.error("Error al actualizar programación:", error);
    return apiErrorText(res, req, 500, "Error interno al actualizar programación", "Internal error while updating schedule");
  }
};

export const cambiarEstadoProgramacion = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, motivo_cancelacion } = req.body;

    if (!estado || !ESTADOS_VALIDOS.includes(estado.toUpperCase())) {
      return apiErrorText(res, req, 400, "Estado inválido", "Invalid status");
    }

    if (estado.toUpperCase() === "CANCELADA" && (!motivo_cancelacion || !motivo_cancelacion.trim())) {
      return res.status(400).json({
        error: localizeInlineText(
          req,
          "Debe enviar un motivo de cancelación al cancelar la programación",
          "You must provide a cancellation reason when cancelling the schedule"
        ),
      });
    }

    const anteriorResult = await pool.query(
      `SELECT * FROM programaciones_servicio WHERE id_programacion = $1`,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return apiErrorText(res, req, 404, "Programación no encontrada", "Schedule not found");
    }

    const anterior = anteriorResult.rows[0];
    const esCancelacion = estado.toUpperCase() === "CANCELADA";

    const query = `
      UPDATE programaciones_servicio
      SET estado = $1,
          motivo_cancelacion = $2,
          updated_by = $3,
          updated_at = NOW(),
          cancelado_por = CASE WHEN $1 = 'CANCELADA' THEN $3 ELSE cancelado_por END,
          cancelado_en = CASE WHEN $1 = 'CANCELADA' THEN NOW() ELSE cancelado_en END
      WHERE id_programacion = $4
      RETURNING *;
    `;

    const values = [
      estado.toUpperCase(),
      motivo_cancelacion?.trim() || null,
      req.user?.id_usuario || null,
      id,
    ];

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return apiErrorText(res, req, 404, "Programación no encontrada", "Schedule not found");
    }

    const programacion = rows[0];

    await registrarAuditoria({
      tabla_afectada: "programaciones_servicio",
      id_registro: programacion.id_programacion,
      accion: esCancelacion ? "CANCELAR" : "CAMBIAR_ESTADO",
      descripcion: esCancelacion
        ? `Se canceló la programación ${programacion.id_programacion}`
        : `Se cambió el estado de la programación ${programacion.id_programacion} a ${programacion.estado}`,
      valores_anteriores: anterior,
      valores_nuevos: programacion,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(programacion);
  } catch (error) {
    console.error("Error al cambiar estado de programación:", error);
    return apiErrorText(res, req, 500, "Error interno al cambiar estado de programación", "Internal error while changing schedule status");
  }
};

export const listarEjecucionesProgramacion = async (req, res) => {
  try {
    const { id } = req.params;

    const programacion = await obtenerProgramacionResumen(pool, id);
    if (!programacion) {
      return apiErrorText(res, req, 404, "Programación no encontrada", "Schedule not found");
    }

    const { rows } = await pool.query(
      `
        SELECT
          id_ejecucion,
          id_programacion,
          fecha_programada,
          fecha_reprogramada,
          hora_programada,
          estado,
          motivo_reprogramacion,
          motivo_cancelacion,
          id_orden_trabajo,
          fecha_generacion_orden,
          fecha_cierre,
          resultado,
          observaciones
        FROM programaciones_ejecuciones
        WHERE id_programacion = $1
        ORDER BY fecha_programada DESC, id_ejecucion DESC
      `,
      [id]
    );

    return res.json(rows);
  } catch (error) {
    console.error("Error al listar ejecuciones de programación:", error);
    return apiErrorText(
      res,
      req,
      500,
      "Error interno al listar ejecuciones de la programación",
      "Internal error while loading schedule visits"
    );
  }
};

export const generarEjecucionProgramacion = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const fechaSolicitada = req.body?.fecha_programada || null;

    await client.query("BEGIN");

    const programacion = await obtenerProgramacionResumen(client, id);
    if (!programacion) {
      await client.query("ROLLBACK");
      return apiErrorText(res, req, 404, "Programación no encontrada", "Schedule not found");
    }

    if (programacion.estado !== "ACTIVA") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: localizeInlineText(
          req,
          "Solo se pueden generar visitas para programaciones activas",
          "Visits can only be generated for active schedules"
        ),
      });
    }

    const fechaProgramada = fechaSolicitada || programacion.proxima_fecha;
    if (!fechaProgramada) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: localizeInlineText(
          req,
          "La programación no tiene próxima fecha definida",
          "The schedule does not have a next date defined"
        ),
      });
    }

    const duplicada = await buscarEjecucionDuplicada(client, id, fechaProgramada);
    if (duplicada) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: localizeInlineText(
          req,
          "Ya existe una visita pendiente o generada para esa fecha",
          "There is already a pending or generated visit for that date"
        ),
      });
    }

    const insertResult = await client.query(
      `
        INSERT INTO programaciones_ejecuciones (
          id_programacion,
          fecha_programada,
          hora_programada,
          estado,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, 'PENDIENTE', $4, $4)
        RETURNING
          id_ejecucion,
          id_programacion,
          fecha_programada,
          fecha_reprogramada,
          hora_programada,
          estado,
          motivo_reprogramacion,
          motivo_cancelacion,
          id_orden_trabajo,
          fecha_generacion_orden,
          fecha_cierre,
          resultado,
          observaciones
      `,
      [id, fechaProgramada, programacion.hora_programada || null, req.user?.id_usuario || null]
    );

    const ejecucion = insertResult.rows[0];

    await registrarAuditoria({
      client,
      tabla_afectada: "programaciones_ejecuciones",
      id_registro: ejecucion.id_ejecucion,
      accion: "CREAR",
      descripcion: `Se generó la visita ${ejecucion.id_ejecucion} para la programación ${id}`,
      valores_anteriores: null,
      valores_nuevos: ejecucion,
      realizado_por: req.user?.id_usuario || null,
    });

    await client.query("COMMIT");
    return res.status(201).json(ejecucion);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al generar ejecución de programación:", error);
    return apiErrorText(
      res,
      req,
      500,
      "Error interno al generar la visita programada",
      "Internal error while generating the scheduled visit"
    );
  } finally {
    client.release();
  }
};

export const reprogramarEjecucionProgramacion = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { nueva_fecha, nueva_hora, motivo_reprogramacion, observaciones } = req.body || {};

    if (!nueva_fecha) {
      client.release();
      return res.status(400).json({
        error: localizeInlineText(
          req,
          "La nueva fecha es obligatoria para reprogramar la visita",
          "A new date is required to reschedule the visit"
        ),
      });
    }

    if (!motivo_reprogramacion || !motivo_reprogramacion.trim()) {
      client.release();
      return res.status(400).json({
        error: localizeInlineText(
          req,
          "Debe indicar el motivo de la reprogramación",
          "You must provide a reschedule reason"
        ),
      });
    }

    await client.query("BEGIN");

    const ejecucionActual = await obtenerEjecucionPorId(client, id);
    if (!ejecucionActual) {
      await client.query("ROLLBACK");
      return apiErrorText(res, req, 404, "Visita programada no encontrada", "Scheduled visit not found");
    }

    if (!ESTADOS_EJECUCION_VALIDOS.includes(ejecucionActual.estado)) {
      await client.query("ROLLBACK");
      return apiErrorText(res, req, 400, "Estado de visita inválido", "Invalid visit status");
    }

    if (["CANCELADA", "COMPLETADA", "REPROGRAMADA"].includes(ejecucionActual.estado)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: localizeInlineText(
          req,
          "Solo se pueden reprogramar visitas pendientes o generadas",
          "Only pending or generated visits can be rescheduled"
        ),
      });
    }

    if (ejecucionActual.estado_programacion !== "ACTIVA") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: localizeInlineText(
          req,
          "No se puede reprogramar una visita de una programación inactiva",
          "Cannot reschedule a visit from an inactive schedule"
        ),
      });
    }

    const duplicada = await buscarEjecucionDuplicada(
      client,
      ejecucionActual.id_programacion,
      nueva_fecha
    );
    if (duplicada) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: localizeInlineText(
          req,
          "Ya existe una visita pendiente o generada para la nueva fecha indicada",
          "There is already a pending or generated visit for the selected new date"
        ),
      });
    }

    const updatedResult = await client.query(
      `
        UPDATE programaciones_ejecuciones
        SET estado = 'REPROGRAMADA',
            fecha_reprogramada = $1,
            motivo_reprogramacion = $2,
            updated_at = NOW(),
            updated_by = $3
        WHERE id_ejecucion = $4
        RETURNING *
      `,
      [nueva_fecha, motivo_reprogramacion.trim(), req.user?.id_usuario || null, id]
    );

    const nuevaResult = await client.query(
      `
        INSERT INTO programaciones_ejecuciones (
          id_programacion,
          fecha_programada,
          hora_programada,
          estado,
          observaciones,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, 'PENDIENTE', $4, $5, $5)
        RETURNING
          id_ejecucion,
          id_programacion,
          fecha_programada,
          fecha_reprogramada,
          hora_programada,
          estado,
          motivo_reprogramacion,
          motivo_cancelacion,
          id_orden_trabajo,
          fecha_generacion_orden,
          fecha_cierre,
          resultado,
          observaciones
      `,
      [
        ejecucionActual.id_programacion,
        nueva_fecha,
        nueva_hora || ejecucionActual.hora_programada || ejecucionActual.hora_programada_base || null,
        observaciones?.trim() || null,
        req.user?.id_usuario || null,
      ]
    );

    const anterior = updatedResult.rows[0];
    const nueva = nuevaResult.rows[0];

    await registrarAuditoria({
      client,
      tabla_afectada: "programaciones_ejecuciones",
      id_registro: anterior.id_ejecucion,
      accion: "REPROGRAMAR",
      descripcion: `Se reprogramó la visita ${anterior.id_ejecucion} de la programación ${anterior.id_programacion}`,
      valores_anteriores: ejecucionActual,
      valores_nuevos: {
        anterior,
        nueva,
      },
      realizado_por: req.user?.id_usuario || null,
    });

    await client.query("COMMIT");
    return res.json({ anterior, nueva });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("Error al reprogramar ejecución:", error);
    return apiErrorText(
      res,
      req,
      500,
      "Error interno al reprogramar la visita",
      "Internal error while rescheduling the visit"
    );
  } finally {
    try {
      client.release();
    } catch {}
  }
};

export const cancelarEjecucionProgramacion = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { motivo_cancelacion } = req.body || {};

    if (!motivo_cancelacion || !motivo_cancelacion.trim()) {
      client.release();
      return res.status(400).json({
        error: localizeInlineText(
          req,
          "Debe indicar el motivo de cancelación de la visita",
          "You must provide a cancellation reason for the visit"
        ),
      });
    }

    await client.query("BEGIN");

    const anterior = await obtenerEjecucionPorId(client, id);
    if (!anterior) {
      await client.query("ROLLBACK");
      return apiErrorText(res, req, 404, "Visita programada no encontrada", "Scheduled visit not found");
    }

    if (!ESTADOS_EJECUCION_VALIDOS.includes(anterior.estado)) {
      await client.query("ROLLBACK");
      return apiErrorText(res, req, 400, "Estado de visita inválido", "Invalid visit status");
    }

    if (["CANCELADA", "COMPLETADA", "REPROGRAMADA"].includes(anterior.estado)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: localizeInlineText(
          req,
          "Solo se pueden cancelar visitas pendientes o generadas",
          "Only pending or generated visits can be cancelled"
        ),
      });
    }

    const updatedResult = await client.query(
      `
        UPDATE programaciones_ejecuciones
        SET estado = 'CANCELADA',
            motivo_cancelacion = $1,
            updated_at = NOW(),
            updated_by = $2
        WHERE id_ejecucion = $3
        RETURNING
          id_ejecucion,
          id_programacion,
          fecha_programada,
          fecha_reprogramada,
          hora_programada,
          estado,
          motivo_reprogramacion,
          motivo_cancelacion,
          id_orden_trabajo,
          fecha_generacion_orden,
          fecha_cierre,
          resultado,
          observaciones
      `,
      [motivo_cancelacion.trim(), req.user?.id_usuario || null, id]
    );

    const ejecucion = updatedResult.rows[0];

    await registrarAuditoria({
      client,
      tabla_afectada: "programaciones_ejecuciones",
      id_registro: ejecucion.id_ejecucion,
      accion: "CANCELAR",
      descripcion: `Se canceló la visita ${ejecucion.id_ejecucion} de la programación ${ejecucion.id_programacion}`,
      valores_anteriores: anterior,
      valores_nuevos: ejecucion,
      realizado_por: req.user?.id_usuario || null,
    });

    await client.query("COMMIT");
    return res.json(ejecucion);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("Error al cancelar ejecución:", error);
    return apiErrorText(
      res,
      req,
      500,
      "Error interno al cancelar la visita",
      "Internal error while cancelling the visit"
    );
  } finally {
    try {
      client.release();
    } catch {}
  }
};

export const generarOrdenDesdeEjecucionProgramacion = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const soportaEmpleadoResponsable = await hasPublicColumn(
      "programaciones_servicio",
      "id_empleado_responsable"
    );

    await client.query("BEGIN");

    const ejecucion = await obtenerEjecucionParaOrden(
      client,
      id,
      soportaEmpleadoResponsable
    );

    if (!ejecucion) {
      await client.query("ROLLBACK");
      return apiErrorText(res, req, 404, "Visita programada no encontrada", "Scheduled visit not found");
    }

    if (ejecucion.id_orden_trabajo) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: localizeInlineText(
          req,
          "Esta visita ya tiene una orden asociada",
          "This visit already has a linked work order"
        ),
      });
    }

    if (!["PENDIENTE", "GENERADA"].includes(ejecucion.estado)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: localizeInlineText(
          req,
          "Solo se pueden generar ordenes desde visitas pendientes o generadas",
          "Orders can only be generated from pending or generated visits"
        ),
      });
    }

    if (ejecucion.estado_programacion !== "ACTIVA") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: localizeInlineText(
          req,
          "Solo se pueden generar ordenes desde programaciones activas",
          "Orders can only be generated from active schedules"
        ),
      });
    }

    if (
      ejecucion.id_empleado_responsable &&
      ejecucion.estado_empleado_responsable &&
      ejecucion.estado_empleado_responsable !== "ACTIVO"
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: localizeInlineText(
          req,
          "El responsable asignado esta inactivo y no puede recibir la orden",
          "The assigned staff member is inactive and cannot receive the order"
        ),
      });
    }

    const disponibilidadResponsable = await validarDisponibilidadResponsableOrdenGenerada(
      req,
      client,
      ejecucion.id_empleado_responsable,
      ejecucion.fecha_programada
    );
    if (!disponibilidadResponsable.ok) {
      await client.query("ROLLBACK");
      return res.status(disponibilidadResponsable.status).json({
        error: disponibilidadResponsable.error,
      });
    }

    const numeroOrden = generarNumeroOrdenProgramada();
    const userId = req.user?.id_usuario || null;
    const horaProgramada =
      ejecucion.hora_programada || ejecucion.hora_programada_base || null;

    const ordenResult = await client.query(
      `
        INSERT INTO ordenes_trabajo (
          numero_orden,
          id_cliente,
          id_propiedad,
          id_cuadrilla,
          fecha_servicio,
          tipo_visita,
          origen,
          hora_inicio_programada,
          descuento,
          costo_estimado,
          observaciones_previas,
          created_by,
          updated_by
        )
        VALUES ($1,$2,$3,$4,$5,'PROGRAMADA','PROGRAMACION',$6,$7,$8,$9,$10,$10)
        RETURNING *;
      `,
      [
        numeroOrden,
        ejecucion.id_cliente,
        ejecucion.id_propiedad,
        ejecucion.id_cuadrilla || null,
        ejecucion.fecha_programada,
        horaProgramada,
        0,
        null,
        ejecucion.observaciones_programacion?.trim() || null,
        userId,
      ]
    );

    const orden = ordenResult.rows[0];
    const subtotal = Number(Number(ejecucion.precio_acordado || 0).toFixed(2));

    await client.query(
      `
        INSERT INTO ordenes_trabajo_detalle (
          id_orden_trabajo,
          id_servicio,
          id_programacion,
          descripcion_servicio,
          cantidad,
          precio_unitario,
          descripcion_precio,
          subtotal,
          duracion_estimada_min,
          estado,
          observaciones
        )
        VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,'PENDIENTE',$9)
      `,
      [
        orden.id_orden_trabajo,
        ejecucion.id_servicio,
        ejecucion.id_programacion,
        ejecucion.servicio || null,
        Number(ejecucion.precio_acordado || 0),
        ejecucion.descripcion_precio?.trim() || null,
        subtotal,
        ejecucion.duracion_estimada_min || null,
        ejecucion.observaciones_programacion?.trim() || null,
      ]
    );

    if (ejecucion.id_empleado_responsable) {
      await client.query(
        `
          INSERT INTO ordenes_empleados (id_orden_trabajo, id_empleado)
          VALUES ($1, $2)
        `,
        [orden.id_orden_trabajo, ejecucion.id_empleado_responsable]
      );
    }

    const ordenFinalResult = await client.query(
      `
        UPDATE ordenes_trabajo
        SET subtotal = $1,
            total_orden = $2,
            updated_at = NOW()
        WHERE id_orden_trabajo = $3
        RETURNING *;
      `,
      [subtotal, subtotal, orden.id_orden_trabajo]
    );
    const ordenFinal = ordenFinalResult.rows[0];

    const ejecucionResult = await client.query(
      `
        UPDATE programaciones_ejecuciones
        SET id_orden_trabajo = $1,
            fecha_generacion_orden = NOW(),
            estado = 'GENERADA',
            updated_at = NOW(),
            updated_by = $2
        WHERE id_ejecucion = $3
        RETURNING
          id_ejecucion,
          id_programacion,
          fecha_programada,
          fecha_reprogramada,
          hora_programada,
          estado,
          motivo_reprogramacion,
          motivo_cancelacion,
          id_orden_trabajo,
          fecha_generacion_orden,
          fecha_cierre,
          resultado,
          observaciones
      `,
      [ordenFinal.id_orden_trabajo, userId, id]
    );

    await registrarAuditoria({
      client,
      tabla_afectada: "ordenes_trabajo",
      id_registro: ordenFinal.id_orden_trabajo,
      accion: "CREAR",
      descripcion: `Se generó la orden ${ordenFinal.numero_orden} desde la visita ${ejecucion.id_ejecucion}`,
      valores_anteriores: null,
      valores_nuevos: ordenFinal,
      realizado_por: userId,
    });

    await registrarAuditoria({
      client,
      tabla_afectada: "programaciones_ejecuciones",
      id_registro: ejecucion.id_ejecucion,
      accion: "ACTUALIZAR",
      descripcion: `Se vinculó la visita ${ejecucion.id_ejecucion} con la orden ${ordenFinal.numero_orden}`,
      valores_anteriores: {
        ...ejecucion,
        id_orden_trabajo: null,
      },
      valores_nuevos: ejecucionResult.rows[0],
      realizado_por: userId,
    });

    await client.query("COMMIT");
    return res.status(201).json(ordenFinal);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("Error al generar orden desde visita programada:", error);
    return apiErrorText(
      res,
      req,
      500,
      "Error interno al generar la orden desde la visita",
      "Internal error while generating the order from the scheduled visit"
    );
  } finally {
    try {
      client.release();
    } catch {}
  }
};
