import { pool } from "../config/db.js";
import { registrarAuditoria } from "../utils/auditoria.js";
import { hasPublicColumn } from "../utils/schema.js";

const FRECUENCIAS_VALIDAS = ["UNICA", "SEMANAL", "QUINCENAL", "MENSUAL"];
const PRIORIDADES_VALIDAS = ["BAJA", "MEDIA", "ALTA", "URGENTE"];
const ESTADOS_VALIDOS = ["ACTIVA", "PAUSADA", "FINALIZADA", "CANCELADA"];
const CODIGOS_ERROR_ESQUEMA = new Set(["42601", "42703", "42P01"]);

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

const validarEmpleadoResponsable = async (id_empleado_responsable, id_cuadrilla) => {
  if (!id_empleado_responsable) {
    return { ok: true, empleado: null };
  }

  const empleadoResult = await pool.query(
    `SELECT id_empleado, id_cuadrilla, estado FROM empleados WHERE id_empleado = $1`,
    [id_empleado_responsable]
  );

  if (empleadoResult.rows.length === 0) {
    return { ok: false, status: 404, error: "El tecnico responsable no existe" };
  }

  const empleado = empleadoResult.rows[0];

  if (empleado.estado !== "ACTIVO") {
    return { ok: false, status: 400, error: "No se puede asignar un tecnico inactivo" };
  }

  if (
    id_cuadrilla &&
    empleado.id_cuadrilla &&
    Number(empleado.id_cuadrilla) !== Number(id_cuadrilla)
  ) {
    return {
      ok: false,
      status: 400,
      error: "El tecnico responsable no pertenece a la cuadrilla seleccionada",
    };
  }

  return { ok: true, empleado };
};

const validarDisponibilidadEmpleadoProgramacion = async (
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
      error: `El tecnico responsable ya tiene una programacion activa para la fecha ${proxima_fecha}`,
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
      empleadoResponsableFinal,
      id_cuadrilla
    );
    if (!empleadoValidacion.ok) {
      return res.status(empleadoValidacion.status).json({ error: empleadoValidacion.error });
    }

    const disponibilidadEmpleado = await validarDisponibilidadEmpleadoProgramacion(
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
    return res.status(500).json({ error: "Error interno al crear programación" });
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
        });

        return res.json(result);
      } catch (fallbackError) {
        console.error("Fallback al listar programaciones:", fallbackError);
      }
    }

    console.error("Error al listar programaciones:", error);
    return res.status(500).json({ error: "Error interno al listar programaciones" });
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
      return res.status(404).json({ error: "Programación no encontrada" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener programación:", error);
    return res.status(500).json({ error: "Error interno al obtener programación" });
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
      empleadoResponsableFinal,
      id_cuadrilla
    );
    if (!empleadoValidacion.ok) {
      return res.status(empleadoValidacion.status).json({ error: empleadoValidacion.error });
    }

    const disponibilidadEmpleado = await validarDisponibilidadEmpleadoProgramacion(
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
      return res.status(404).json({ error: "Programación no encontrada" });
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
    return res.status(500).json({ error: "Error interno al actualizar programación" });
  }
};

export const cambiarEstadoProgramacion = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, motivo_cancelacion } = req.body;

    if (!estado || !ESTADOS_VALIDOS.includes(estado.toUpperCase())) {
      return res.status(400).json({ error: "Estado inválido" });
    }

    if (estado.toUpperCase() === "CANCELADA" && (!motivo_cancelacion || !motivo_cancelacion.trim())) {
      return res.status(400).json({
        error: "Debe enviar un motivo de cancelación al cancelar la programación",
      });
    }

    const anteriorResult = await pool.query(
      `SELECT * FROM programaciones_servicio WHERE id_programacion = $1`,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return res.status(404).json({ error: "Programación no encontrada" });
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
      return res.status(404).json({ error: "Programación no encontrada" });
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
    return res.status(500).json({ error: "Error interno al cambiar estado de programación" });
  }
};
