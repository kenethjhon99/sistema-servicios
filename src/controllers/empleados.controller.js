import { pool } from "../config/db.js";
import { registrarAuditoria } from "../utils/auditoria.js";
import { hasPublicColumn } from "../utils/schema.js";

const ESTADOS_VALIDOS = ["ACTIVO", "INACTIVO"];
const DIAS_PAGO_SEMANAL = 7;
const CODIGOS_ERROR_ESQUEMA = new Set(["42601", "42703", "42P01"]);

const normalizarNumeroOpcional = (value, fieldName) => {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }

  const numero = Number(value);
  if (!Number.isFinite(numero) || numero < 0) {
    return {
      error: `${fieldName} debe ser un numero mayor o igual a 0`,
    };
  }

  return { value: Number(numero.toFixed(2)) };
};

const normalizarEmpleado = (empleado) => {
  if (!empleado) {
    return empleado;
  }

  const horasTrabajoDia =
    empleado.horas_trabajo_dia === undefined || empleado.horas_trabajo_dia === null
      ? null
      : Number(empleado.horas_trabajo_dia);
  const pagoDiario =
    empleado.pago_diario === undefined || empleado.pago_diario === null
      ? null
      : Number(empleado.pago_diario);

  return {
    ...empleado,
    horas_trabajo_dia: horasTrabajoDia,
    pago_diario: pagoDiario,
    pago_semanal_estimado:
      pagoDiario === null ? null : Number((pagoDiario * DIAS_PAGO_SEMANAL).toFixed(2)),
  };
};

const obtenerSoporteCamposLaborales = async () => {
  const [soportaHorasTrabajoDia, soportaPagoDiario] = await Promise.all([
    hasPublicColumn("empleados", "horas_trabajo_dia"),
    hasPublicColumn("empleados", "pago_diario"),
  ]);

  return {
    soportaHorasTrabajoDia,
    soportaPagoDiario,
  };
};

const construirWhereEmpleados = ({ estado, id_cuadrilla, busqueda }) => {
  let whereClause = " WHERE 1=1 ";
  const values = [];
  let index = 1;

  if (estado) {
    const estadoUpper = estado.toUpperCase();
    if (!ESTADOS_VALIDOS.includes(estadoUpper)) {
      return { error: "Estado invalido. Use ACTIVO o INACTIVO" };
    }

    whereClause += ` AND e.estado = $${index}`;
    values.push(estadoUpper);
    index++;
  }

  if (id_cuadrilla) {
    whereClause += ` AND e.id_cuadrilla = $${index}`;
    values.push(id_cuadrilla);
    index++;
  }

  if (busqueda) {
    whereClause += ` AND (
      e.nombre_completo ILIKE $${index}
      OR e.correo ILIKE $${index}
      OR e.telefono ILIKE $${index}
      OR e.especialidad ILIKE $${index}
      OR e.puesto ILIKE $${index}
      OR cu.nombre ILIKE $${index}
    )`;
    values.push(`%${busqueda}%`);
    index++;
  }

  return { whereClause, values, index };
};

const consultarListadoEmpleados = async ({
  estado,
  id_cuadrilla,
  busqueda,
  fecha,
  exclude_id_orden_trabajo,
  exclude_id_programacion,
  page,
  limit,
  offset,
  soportaEmpleadoResponsable,
  soportaHorasTrabajoDia,
  soportaPagoDiario,
}) => {
  const where = construirWhereEmpleados({ estado, id_cuadrilla, busqueda });
  if (where.error) {
    return { error: where.error };
  }

  const { whereClause, values, index } = where;
  const countResult = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM empleados e
      LEFT JOIN cuadrillas cu ON e.id_cuadrilla = cu.id_cuadrilla
      ${whereClause}
    `,
    values
  );
  const total = countResult.rows[0].total;

  const fechaIndex = index;
  const excludeOrdenIndex = index + 1;
  const excludeProgramacionIndex = index + 2;
  const programacionesFechaCountSql = soportaEmpleadoResponsable
    ? `
      CASE
        WHEN $${fechaIndex}::date IS NULL THEN 0
        ELSE (
          SELECT COUNT(*)::int
          FROM programaciones_servicio ps
          WHERE ps.id_empleado_responsable = e.id_empleado
            AND ps.proxima_fecha = $${fechaIndex}
            AND ps.estado = 'ACTIVA'
            AND (
              $${excludeProgramacionIndex}::bigint IS NULL
              OR ps.id_programacion <> $${excludeProgramacionIndex}
            )
        )
      END AS programaciones_fecha_count
    `
    : `0::int AS programaciones_fecha_count`;

  const dataQuery = `
    SELECT
      e.id_empleado,
      e.id_cuadrilla,
      cu.nombre AS cuadrilla,
      e.nombre_completo,
      e.telefono,
      e.correo,
      e.especialidad,
      e.puesto,
      ${
        soportaHorasTrabajoDia
          ? "e.horas_trabajo_dia,"
          : "NULL::numeric AS horas_trabajo_dia,"
      }
      ${soportaPagoDiario ? "e.pago_diario," : "NULL::numeric AS pago_diario,"}
      e.estado,
      e.created_at,
      e.updated_at,
      CASE
        WHEN $${fechaIndex}::date IS NULL THEN 0
        ELSE (
          SELECT COUNT(DISTINCT oe.id_orden_trabajo)::int
          FROM ordenes_empleados oe
          INNER JOIN ordenes_trabajo ot
            ON oe.id_orden_trabajo = ot.id_orden_trabajo
          WHERE oe.id_empleado = e.id_empleado
            AND ot.fecha_servicio = $${fechaIndex}
            AND ot.estado <> 'CANCELADA'
            AND (
              $${excludeOrdenIndex}::bigint IS NULL
              OR ot.id_orden_trabajo <> $${excludeOrdenIndex}
            )
        )
      END AS ordenes_fecha_count,
      ${programacionesFechaCountSql}
    FROM empleados e
    LEFT JOIN cuadrillas cu ON e.id_cuadrilla = cu.id_cuadrilla
    ${whereClause}
    ORDER BY e.nombre_completo ASC, e.id_empleado ASC
    LIMIT $${index + 3} OFFSET $${index + 4}
  `;

  const { rows } = await pool.query(dataQuery, [
    ...values,
    fecha || null,
    exclude_id_orden_trabajo || null,
    exclude_id_programacion || null,
    limit,
    offset,
  ]);

  const data = rows.map((row) => {
    const ordenes_fecha_count = Number(row.ordenes_fecha_count || 0);
    const programaciones_fecha_count = Number(row.programaciones_fecha_count || 0);
    const carga_fecha_total = ordenes_fecha_count + programaciones_fecha_count;
    const empleado = normalizarEmpleado(row);

    return {
      ...empleado,
      ordenes_fecha_count,
      programaciones_fecha_count,
      carga_fecha_total,
      disponible_fecha: fecha ? carga_fecha_total === 0 : null,
    };
  });

  return {
    data,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
};

const consultarListadoEmpleadosBasico = async ({
  estado,
  id_cuadrilla,
  busqueda,
  page,
  limit,
  offset,
}) => {
  const where = construirWhereEmpleados({ estado, id_cuadrilla, busqueda });
  if (where.error) {
    return { error: where.error };
  }

  const whereClause = where.whereClause.replace(/cu\.nombre ILIKE \$\d+\s*\)/, "FALSE)");
  const values = where.values;
  const index = where.index;

  const countResult = await pool.query(
    `
      SELECT COUNT(*)::int AS total
      FROM empleados e
      ${whereClause}
    `,
    values
  );
  const total = countResult.rows[0].total;

  const { rows } = await pool.query(
    `
      SELECT
        e.id_empleado,
        e.id_cuadrilla,
        NULL::varchar AS cuadrilla,
        e.nombre_completo,
        e.telefono,
        e.correo,
        e.especialidad,
        e.puesto,
        NULL::numeric AS horas_trabajo_dia,
        NULL::numeric AS pago_diario,
        e.estado,
        e.created_at,
        e.updated_at,
        0::int AS ordenes_fecha_count,
        0::int AS programaciones_fecha_count
      FROM empleados e
      ${whereClause}
      ORDER BY e.nombre_completo ASC, e.id_empleado ASC
      LIMIT $${index} OFFSET $${index + 1}
    `,
    [...values, limit, offset]
  );

  const data = rows.map((row) => ({
    ...normalizarEmpleado(row),
    ordenes_fecha_count: 0,
    programaciones_fecha_count: 0,
    carga_fecha_total: 0,
    disponible_fecha: null,
  }));

  return {
    data,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
};

const validarCuadrilla = async (id_cuadrilla) => {
  if (!id_cuadrilla) {
    return { ok: true, cuadrilla: null };
  }

  const { rows } = await pool.query(
    `
      SELECT id_cuadrilla, nombre, estado
      FROM cuadrillas
      WHERE id_cuadrilla = $1
    `,
    [id_cuadrilla]
  );

  if (rows.length === 0) {
    return { ok: false, status: 404, error: "La cuadrilla seleccionada no existe" };
  }

  if (rows[0].estado !== "ACTIVA") {
    return { ok: false, status: 400, error: "No se puede asignar una cuadrilla inactiva" };
  }

  return { ok: true, cuadrilla: rows[0] };
};

export const listarEmpleados = async (req, res) => {
  try {
    const {
      estado,
      id_cuadrilla,
      busqueda,
      fecha,
      exclude_id_orden_trabajo,
      exclude_id_programacion,
    } = req.query;
    const { page, limit, offset } = req.pagination || {
      page: 1,
      limit: 50,
      offset: 0,
    };

    const soportaEmpleadoResponsable = await hasPublicColumn(
      "programaciones_servicio",
      "id_empleado_responsable"
    );
    const { soportaHorasTrabajoDia, soportaPagoDiario } =
      await obtenerSoporteCamposLaborales();
    const result = await consultarListadoEmpleados({
      estado,
      id_cuadrilla,
      busqueda,
      fecha,
      exclude_id_orden_trabajo,
      exclude_id_programacion,
      page,
      limit,
      offset,
      soportaEmpleadoResponsable,
      soportaHorasTrabajoDia,
      soportaPagoDiario,
    });

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    return res.json(result);
  } catch (error) {
    try {
      const {
        estado,
        id_cuadrilla,
        busqueda,
        fecha,
        exclude_id_orden_trabajo,
        exclude_id_programacion,
      } = req.query;
      const { page, limit, offset } = req.pagination || {
        page: 1,
        limit: 50,
        offset: 0,
      };

      if (CODIGOS_ERROR_ESQUEMA.has(error.code)) {
        const fallbackCompat = await consultarListadoEmpleados({
          estado,
          id_cuadrilla,
          busqueda,
          fecha,
          exclude_id_orden_trabajo,
          exclude_id_programacion,
          page,
          limit,
          offset,
          soportaEmpleadoResponsable: false,
          soportaHorasTrabajoDia: false,
          soportaPagoDiario: false,
        });

        if (!fallbackCompat.error) {
          return res.json(fallbackCompat);
        }
      }

      const fallbackBasico = await consultarListadoEmpleadosBasico({
        estado,
        id_cuadrilla,
        busqueda,
        page,
        limit,
        offset,
      });

      if (!fallbackBasico.error) {
        return res.json(fallbackBasico);
      }
    } catch (fallbackError) {
      console.error("Fallback al listar empleados:", fallbackError);
    }

    console.error("Error al listar empleados:", error);
    return res.status(500).json({ error: "Error interno al listar empleados" });
  }
};

export const obtenerEmpleadoPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const { soportaHorasTrabajoDia, soportaPagoDiario } =
      await obtenerSoporteCamposLaborales();

    const { rows } = await pool.query(
      `
        SELECT
          e.id_empleado,
          e.id_cuadrilla,
          cu.nombre AS cuadrilla,
          e.nombre_completo,
          e.telefono,
          e.correo,
          e.especialidad,
          e.puesto,
          ${
            soportaHorasTrabajoDia
              ? "e.horas_trabajo_dia,"
              : "NULL::numeric AS horas_trabajo_dia,"
          }
          ${soportaPagoDiario ? "e.pago_diario," : "NULL::numeric AS pago_diario,"}
          e.estado,
          e.created_at,
          e.updated_at
        FROM empleados e
        LEFT JOIN cuadrillas cu ON e.id_cuadrilla = cu.id_cuadrilla
        WHERE e.id_empleado = $1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Empleado no encontrado" });
    }

    return res.json(normalizarEmpleado(rows[0]));
  } catch (error) {
    console.error("Error al obtener empleado:", error);
    return res.status(500).json({ error: "Error interno al obtener empleado" });
  }
};

export const crearEmpleado = async (req, res) => {
  try {
    const {
      id_cuadrilla,
      nombre_completo,
      telefono,
      correo,
      especialidad,
      puesto,
      horas_trabajo_dia,
      pago_diario,
    } = req.body;

    if (!nombre_completo || !nombre_completo.trim()) {
      return res.status(400).json({ error: "El nombre completo es obligatorio" });
    }

    const horasTrabajoDia = normalizarNumeroOpcional(
      horas_trabajo_dia,
      "Las horas de trabajo por dia"
    );
    if (horasTrabajoDia.error) {
      return res.status(400).json({ error: horasTrabajoDia.error });
    }

    const pagoDiario = normalizarNumeroOpcional(pago_diario, "El pago diario");
    if (pagoDiario.error) {
      return res.status(400).json({ error: pagoDiario.error });
    }

    const cuadrillaValidacion = await validarCuadrilla(id_cuadrilla);
    if (!cuadrillaValidacion.ok) {
      return res.status(cuadrillaValidacion.status).json({ error: cuadrillaValidacion.error });
    }

    const { soportaHorasTrabajoDia, soportaPagoDiario } =
      await obtenerSoporteCamposLaborales();
    const insertColumns = [
      "id_cuadrilla",
      "nombre_completo",
      "telefono",
      "correo",
      "especialidad",
      "puesto",
      ...(soportaHorasTrabajoDia ? ["horas_trabajo_dia"] : []),
      ...(soportaPagoDiario ? ["pago_diario"] : []),
      "created_by",
      "updated_by",
    ];
    const insertValues = [
      id_cuadrilla || null,
      nombre_completo.trim(),
      telefono?.trim() || null,
      correo?.trim() || null,
      especialidad?.trim() || null,
      puesto?.trim() || null,
      ...(soportaHorasTrabajoDia ? [horasTrabajoDia.value] : []),
      ...(soportaPagoDiario ? [pagoDiario.value] : []),
      req.user?.id_usuario || null,
      req.user?.id_usuario || null,
    ];

    const { rows } = await pool.query(
      `
        INSERT INTO empleados (${insertColumns.join(", ")})
        VALUES (${insertColumns.map((_, idx) => `$${idx + 1}`).join(", ")})
        RETURNING *
      `,
      insertValues
    );

    const empleado = normalizarEmpleado(rows[0]);

    await registrarAuditoria({
      tabla_afectada: "empleados",
      id_registro: empleado.id_empleado,
      accion: "CREAR",
      descripcion: `Se creo el empleado ${empleado.nombre_completo}`,
      valores_nuevos: empleado,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.status(201).json(empleado);
  } catch (error) {
    console.error("Error al crear empleado:", error);
    return res.status(500).json({ error: "Error interno al crear empleado" });
  }
};

export const actualizarEmpleado = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      id_cuadrilla,
      nombre_completo,
      telefono,
      correo,
      especialidad,
      puesto,
      horas_trabajo_dia,
      pago_diario,
    } = req.body;

    if (!nombre_completo || !nombre_completo.trim()) {
      return res.status(400).json({ error: "El nombre completo es obligatorio" });
    }

    const horasTrabajoDia = normalizarNumeroOpcional(
      horas_trabajo_dia,
      "Las horas de trabajo por dia"
    );
    if (horasTrabajoDia.error) {
      return res.status(400).json({ error: horasTrabajoDia.error });
    }

    const pagoDiario = normalizarNumeroOpcional(pago_diario, "El pago diario");
    if (pagoDiario.error) {
      return res.status(400).json({ error: pagoDiario.error });
    }

    const anteriorResult = await pool.query(
      `SELECT * FROM empleados WHERE id_empleado = $1`,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return res.status(404).json({ error: "Empleado no encontrado" });
    }

    const cuadrillaValidacion = await validarCuadrilla(id_cuadrilla);
    if (!cuadrillaValidacion.ok) {
      return res.status(cuadrillaValidacion.status).json({ error: cuadrillaValidacion.error });
    }

    const anterior = anteriorResult.rows[0];
    const { soportaHorasTrabajoDia, soportaPagoDiario } =
      await obtenerSoporteCamposLaborales();
    const updateEntries = [
      ["id_cuadrilla", id_cuadrilla || null],
      ["nombre_completo", nombre_completo.trim()],
      ["telefono", telefono?.trim() || null],
      ["correo", correo?.trim() || null],
      ["especialidad", especialidad?.trim() || null],
      ["puesto", puesto?.trim() || null],
      ...(soportaHorasTrabajoDia ? [["horas_trabajo_dia", horasTrabajoDia.value]] : []),
      ...(soportaPagoDiario ? [["pago_diario", pagoDiario.value]] : []),
      ["updated_by", req.user?.id_usuario || null],
    ];
    const setClause = updateEntries
      .map(([column], idx) => `${column} = $${idx + 1}`)
      .join(",\n            ");
    const updateValues = updateEntries.map(([, value]) => value);

    const { rows } = await pool.query(
      `
        UPDATE empleados
        SET ${setClause},
            updated_at = NOW()
        WHERE id_empleado = $${updateEntries.length + 1}
        RETURNING *
      `,
      [...updateValues, id]
    );

    const empleado = normalizarEmpleado(rows[0]);

    await registrarAuditoria({
      tabla_afectada: "empleados",
      id_registro: empleado.id_empleado,
      accion: "ACTUALIZAR",
      descripcion: `Se actualizo el empleado ${empleado.nombre_completo}`,
      valores_anteriores: anterior,
      valores_nuevos: empleado,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(empleado);
  } catch (error) {
    console.error("Error al actualizar empleado:", error);
    return res.status(500).json({ error: "Error interno al actualizar empleado" });
  }
};

export const cambiarEstadoEmpleado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !ESTADOS_VALIDOS.includes(estado.toUpperCase())) {
      return res.status(400).json({ error: "Estado invalido. Use ACTIVO o INACTIVO" });
    }

    const anteriorResult = await pool.query(
      `SELECT * FROM empleados WHERE id_empleado = $1`,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return res.status(404).json({ error: "Empleado no encontrado" });
    }

    const anterior = anteriorResult.rows[0];

    const { rows } = await pool.query(
      `
        UPDATE empleados
        SET estado = $1,
            updated_by = $2,
            updated_at = NOW()
        WHERE id_empleado = $3
        RETURNING *
      `,
      [estado.toUpperCase(), req.user?.id_usuario || null, id]
    );

    const empleado = rows[0];

    await registrarAuditoria({
      tabla_afectada: "empleados",
      id_registro: empleado.id_empleado,
      accion: "CAMBIAR_ESTADO",
      descripcion: `Se cambio el estado del empleado ${empleado.nombre_completo} a ${empleado.estado}`,
      valores_anteriores: anterior,
      valores_nuevos: empleado,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json(empleado);
  } catch (error) {
    console.error("Error al cambiar estado del empleado:", error);
    return res.status(500).json({ error: "Error interno al cambiar estado del empleado" });
  }
};
