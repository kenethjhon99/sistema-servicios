import { pool } from "../config/db.js";
import { apiErrorText } from "../i18n/apiMessages.js";
import { hasPublicColumn } from "../utils/schema.js";

const formatearFechaISO = (fecha) => {
  if (!fecha) return null;
  return new Date(fecha).toISOString().split("T")[0];
};

export const obtenerAgendaDia = async (req, res) => {
  try {
    const { fecha } = req.query;

    if (!fecha) {
      return apiErrorText(
        res,
        req,
        400,
        "Debe enviar la fecha en formato YYYY-MM-DD",
        "You must provide the date in YYYY-MM-DD format"
      );
    }

    const soportaEjecucionesProgramacion = await hasPublicColumn(
      "programaciones_ejecuciones",
      "id_ejecucion"
    );
    const soportaEmpleadoResponsable = await hasPublicColumn(
      "programaciones_servicio",
      "id_empleado_responsable"
    );
    const soportaSeguimientosCobranza = await hasPublicColumn(
      "cobranza_seguimientos",
      "id_seguimiento"
    );

    const programacionesBaseSelect = `
      SELECT
        ps.id_programacion,
        ${
          soportaEmpleadoResponsable
            ? "ps.id_empleado_responsable,"
            : "NULL::bigint AS id_empleado_responsable,"
        }
        ps.frecuencia,
        ps.hora_programada,
        ps.proxima_fecha,
        ps.precio_acordado,
        ps.descripcion_precio,
        ps.prioridad,
        ps.estado,
        c.id_cliente,
        c.nombre_completo AS cliente,
        p.id_propiedad,
        p.nombre_propiedad,
        p.direccion,
        s.id_servicio,
        s.nombre AS servicio,
        cs.nombre AS categoria_servicio,
        cu.nombre AS cuadrilla,
        ${
          soportaEmpleadoResponsable
            ? "e.nombre_completo AS empleado_responsable,"
            : "NULL::varchar AS empleado_responsable,"
        }
        ${
          soportaEjecucionesProgramacion
            ? `ultima_ejecucion.fecha_programada AS ultima_ejecucion_fecha,
        ultima_ejecucion.estado AS ultima_ejecucion_estado,
        visita_dia.id_ejecucion AS id_ejecucion_dia,
        visita_dia.estado AS estado_visita_actual,
        visita_dia.id_orden_trabajo AS id_orden_trabajo_visita`
            : `NULL::date AS ultima_ejecucion_fecha,
        NULL::varchar AS ultima_ejecucion_estado,
        NULL::bigint AS id_ejecucion_dia,
        NULL::varchar AS estado_visita_actual,
        NULL::bigint AS id_orden_trabajo_visita`
        }
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
      ${
        soportaEjecucionesProgramacion
          ? `
      LEFT JOIN LATERAL (
        SELECT
          pe.fecha_programada,
          pe.estado
        FROM programaciones_ejecuciones pe
        WHERE pe.id_programacion = ps.id_programacion
        ORDER BY pe.fecha_programada DESC, pe.id_ejecucion DESC
        LIMIT 1
      ) AS ultima_ejecucion ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          pe.id_ejecucion,
          pe.estado,
          pe.id_orden_trabajo
        FROM programaciones_ejecuciones pe
        WHERE pe.id_programacion = ps.id_programacion
          AND pe.fecha_programada = ps.proxima_fecha
          AND pe.estado IN ('PENDIENTE', 'GENERADA')
        ORDER BY pe.id_ejecucion DESC
        LIMIT 1
      ) AS visita_dia ON TRUE
      `
          : ""
      }
    `;

    const programacionesQuery = `
      ${programacionesBaseSelect}
      WHERE ps.proxima_fecha = $1
        AND ps.estado = 'ACTIVA'
      ORDER BY ps.hora_programada ASC NULLS LAST, ps.id_programacion ASC
    `;

    const programacionesVencidasQuery = `
      ${programacionesBaseSelect}
      WHERE ps.proxima_fecha < $1
        AND ps.estado = 'ACTIVA'
      ORDER BY ps.proxima_fecha ASC, ps.hora_programada ASC NULLS LAST, ps.id_programacion ASC
    `;

    const ordenesQuery = `
      SELECT
        ot.id_orden_trabajo,
        ot.numero_orden,
        ot.fecha_servicio,
        ot.tipo_visita,
        ot.origen,
        ot.hora_inicio_programada,
        ot.hora_inicio_real,
        ot.hora_fin_real,
        ot.estado,
        ot.total_orden,
        c.id_cliente,
        c.nombre_completo AS cliente,
        p.id_propiedad,
        p.nombre_propiedad,
        p.direccion,
        cu.nombre AS cuadrilla,
        te.tecnicos
      FROM ordenes_trabajo ot
      INNER JOIN clientes c ON ot.id_cliente = c.id_cliente
      INNER JOIN propiedades p ON ot.id_propiedad = p.id_propiedad
      LEFT JOIN cuadrillas cu ON ot.id_cuadrilla = cu.id_cuadrilla
      LEFT JOIN (
        SELECT
          oe.id_orden_trabajo,
          STRING_AGG(e.nombre_completo, ', ' ORDER BY e.nombre_completo) AS tecnicos
        FROM ordenes_empleados oe
        INNER JOIN empleados e ON oe.id_empleado = e.id_empleado
        GROUP BY oe.id_orden_trabajo
      ) te ON te.id_orden_trabajo = ot.id_orden_trabajo
      WHERE ot.fecha_servicio = $1
      ORDER BY ot.hora_inicio_programada ASC NULLS LAST, ot.id_orden_trabajo ASC
    `;

    const creditosQuery = `
      SELECT
        cr.id_credito,
        cr.fecha_vencimiento,
        cr.estado,
        cr.saldo_pendiente,
        c.id_cliente,
        c.nombre_completo AS cliente,
        ot.numero_orden
      FROM creditos cr
      INNER JOIN clientes c ON cr.id_cliente = c.id_cliente
      INNER JOIN ordenes_trabajo ot ON cr.id_orden_trabajo = ot.id_orden_trabajo
      WHERE cr.fecha_vencimiento = $1
        AND cr.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')
      ORDER BY cr.id_credito DESC
    `;

    const cobranzaAlertasQuery = `
      SELECT
        cr.id_credito,
        cr.id_cliente,
        c.nombre_completo AS cliente,
        cr.id_orden_trabajo,
        ot.numero_orden,
        cr.estado,
        cr.fecha_vencimiento,
        COALESCE(cr.saldo_pendiente, 0)::numeric AS saldo_pendiente,
        CASE
          WHEN cr.fecha_vencimiento < $1 AND COALESCE(cr.saldo_pendiente, 0) > 0
            THEN ($1::date - cr.fecha_vencimiento)::int
          ELSE 0
        END AS dias_vencido,
        ${
          soportaSeguimientosCobranza
            ? `ultimo_seguimiento.fecha_seguimiento AS ultimo_seguimiento_fecha,
        ultimo_seguimiento.resultado AS ultimo_seguimiento_resultado,
        ultimo_seguimiento.proximo_contacto,
        ultimo_seguimiento.notas AS ultima_nota_seguimiento`
            : `NULL::date AS ultimo_seguimiento_fecha,
        NULL::varchar AS ultimo_seguimiento_resultado,
        NULL::date AS proximo_contacto,
        NULL::text AS ultima_nota_seguimiento`
        }
      FROM creditos cr
      INNER JOIN clientes c ON cr.id_cliente = c.id_cliente
      INNER JOIN ordenes_trabajo ot ON cr.id_orden_trabajo = ot.id_orden_trabajo
      ${
        soportaSeguimientosCobranza
          ? `
      LEFT JOIN LATERAL (
        SELECT
          cs.fecha_seguimiento,
          cs.resultado,
          cs.proximo_contacto,
          cs.notas
        FROM cobranza_seguimientos cs
        WHERE cs.id_credito = cr.id_credito
           OR (cs.id_credito IS NULL AND cs.id_cliente = cr.id_cliente)
        ORDER BY cs.fecha_seguimiento DESC, cs.id_seguimiento DESC
        LIMIT 1
      ) ultimo_seguimiento ON TRUE
      `
          : ""
      }
      WHERE cr.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')
        AND COALESCE(cr.saldo_pendiente, 0) > 0
        AND (
          cr.fecha_vencimiento <= $1
          ${
            soportaSeguimientosCobranza
              ? "OR ultimo_seguimiento.proximo_contacto <= $1"
              : ""
          }
        )
      ORDER BY
        CASE
          WHEN cr.fecha_vencimiento < $1 AND COALESCE(cr.saldo_pendiente, 0) > 0
            THEN ($1::date - cr.fecha_vencimiento)::int
          ELSE 0
        END DESC,
        COALESCE(cr.saldo_pendiente, 0) DESC,
        cr.id_credito DESC
      LIMIT 5
    `;

    const [programaciones, programacionesVencidas, ordenes, creditos, cobranzaAlertas] = await Promise.all([
      pool.query(programacionesQuery, [fecha]),
      pool.query(programacionesVencidasQuery, [fecha]),
      pool.query(ordenesQuery, [fecha]),
      pool.query(creditosQuery, [fecha]),
      pool.query(cobranzaAlertasQuery, [fecha]),
    ]);

    return res.json({
      fecha,
      programaciones: programaciones.rows,
      programaciones_vencidas: programacionesVencidas.rows,
      ordenes: ordenes.rows,
      vencimientos_credito: creditos.rows,
      cobranza_alertas: cobranzaAlertas.rows,
      resumen: {
        total_programaciones: programaciones.rows.length,
        total_programaciones_vencidas: programacionesVencidas.rows.length,
        total_ordenes: ordenes.rows.length,
        total_vencimientos_credito: creditos.rows.length,
        total_cobranza_alertas: cobranzaAlertas.rows.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener agenda del día:", error);
    return apiErrorText(res, req, 500, "Error interno al obtener agenda del día", "Internal error while loading daily agenda");
  }
};

export const obtenerAgendaRango = async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta } = req.query;

    if (!fecha_desde || !fecha_hasta) {
      return apiErrorText(
        res,
        req,
        400,
        "Debe enviar fecha_desde y fecha_hasta en formato YYYY-MM-DD",
        "You must provide fecha_desde and fecha_hasta in YYYY-MM-DD format"
      );
    }

    const soportaEjecucionesProgramacion = await hasPublicColumn(
      "programaciones_ejecuciones",
      "id_ejecucion"
    );
    const soportaEmpleadoResponsable = await hasPublicColumn(
      "programaciones_servicio",
      "id_empleado_responsable"
    );

    const programacionesQuery = `
      SELECT
        ps.id_programacion,
        ${
          soportaEmpleadoResponsable
            ? "ps.id_empleado_responsable,"
            : "NULL::bigint AS id_empleado_responsable,"
        }
        ps.proxima_fecha,
        ps.hora_programada,
        ps.frecuencia,
        ps.prioridad,
        ps.estado,
        c.nombre_completo AS cliente,
        p.nombre_propiedad,
        s.nombre AS servicio,
        cs.nombre AS categoria_servicio,
        cu.nombre AS cuadrilla,
        ${
          soportaEmpleadoResponsable
            ? "e.nombre_completo AS empleado_responsable,"
            : "NULL::varchar AS empleado_responsable,"
        }
        ${
          soportaEjecucionesProgramacion
            ? `ultima_ejecucion.fecha_programada AS ultima_ejecucion_fecha,
        ultima_ejecucion.estado AS ultima_ejecucion_estado,
        visita_actual.id_ejecucion AS id_ejecucion_actual,
        visita_actual.estado AS estado_visita_actual,
        visita_actual.id_orden_trabajo AS id_orden_trabajo_visita`
            : `NULL::date AS ultima_ejecucion_fecha,
        NULL::varchar AS ultima_ejecucion_estado,
        NULL::bigint AS id_ejecucion_actual,
        NULL::varchar AS estado_visita_actual,
        NULL::bigint AS id_orden_trabajo_visita`
        }
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
      ${
        soportaEjecucionesProgramacion
          ? `
      LEFT JOIN LATERAL (
        SELECT
          pe.fecha_programada,
          pe.estado
        FROM programaciones_ejecuciones pe
        WHERE pe.id_programacion = ps.id_programacion
        ORDER BY pe.fecha_programada DESC, pe.id_ejecucion DESC
        LIMIT 1
      ) AS ultima_ejecucion ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          pe.id_ejecucion,
          pe.estado,
          pe.id_orden_trabajo
        FROM programaciones_ejecuciones pe
        WHERE pe.id_programacion = ps.id_programacion
          AND pe.fecha_programada = ps.proxima_fecha
          AND pe.estado IN ('PENDIENTE', 'GENERADA')
        ORDER BY pe.id_ejecucion DESC
        LIMIT 1
      ) AS visita_actual ON TRUE
      `
          : ""
      }
      WHERE ps.proxima_fecha BETWEEN $1 AND $2
        AND ps.estado = 'ACTIVA'
      ORDER BY ps.proxima_fecha ASC, ps.hora_programada ASC NULLS LAST
    `;

    const ordenesQuery = `
      SELECT
        ot.id_orden_trabajo,
        ot.numero_orden,
        ot.fecha_servicio,
        ot.tipo_visita,
        ot.estado,
        ot.hora_inicio_programada,
        c.nombre_completo AS cliente,
        p.nombre_propiedad,
        cu.nombre AS cuadrilla,
        ot.total_orden
      FROM ordenes_trabajo ot
      INNER JOIN clientes c ON ot.id_cliente = c.id_cliente
      INNER JOIN propiedades p ON ot.id_propiedad = p.id_propiedad
      LEFT JOIN cuadrillas cu ON ot.id_cuadrilla = cu.id_cuadrilla
      WHERE ot.fecha_servicio BETWEEN $1 AND $2
      ORDER BY ot.fecha_servicio ASC, ot.hora_inicio_programada ASC NULLS LAST
    `;

    const [programaciones, ordenes] = await Promise.all([
      pool.query(programacionesQuery, [fecha_desde, fecha_hasta]),
      pool.query(ordenesQuery, [fecha_desde, fecha_hasta]),
    ]);

    return res.json({
      fecha_desde,
      fecha_hasta,
      programaciones: programaciones.rows,
      ordenes: ordenes.rows,
      resumen: {
        total_programaciones: programaciones.rows.length,
        total_ordenes: ordenes.rows.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener agenda por rango:", error);
    return apiErrorText(res, req, 500, "Error interno al obtener agenda por rango", "Internal error while loading agenda by range");
  }
};

export const obtenerCalendarioMensual = async (req, res) => {
  try {
    const { anio, mes } = req.query;

    if (!anio || !mes) {
      return apiErrorText(res, req, 400, "Debe enviar anio y mes", "You must provide year and month");
    }

    const year = Number(anio);
    const month = Number(mes);

    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return apiErrorText(res, req, 400, "Mes o año inválidos", "Invalid month or year");
    }

    const fechaInicio = `${year}-${String(month).padStart(2, "0")}-01`;
    const fechaFinResult = await pool.query(
      `SELECT (DATE_TRUNC('month', $1::date) + INTERVAL '1 month - 1 day')::date AS fin`,
      [fechaInicio]
    );
    const fechaFin = fechaFinResult.rows[0].fin;

    const programacionesQuery = `
      SELECT
        proxima_fecha::date AS fecha,
        COUNT(*)::int AS total
      FROM programaciones_servicio
      WHERE proxima_fecha BETWEEN $1 AND $2
        AND estado = 'ACTIVA'
      GROUP BY proxima_fecha
      ORDER BY proxima_fecha ASC
    `;

    const ordenesQuery = `
      SELECT
        fecha_servicio::date AS fecha,
        COUNT(*)::int AS total
      FROM ordenes_trabajo
      WHERE fecha_servicio BETWEEN $1 AND $2
      GROUP BY fecha_servicio
      ORDER BY fecha_servicio ASC
    `;

    const creditosQuery = `
      SELECT
        fecha_vencimiento::date AS fecha,
        COUNT(*)::int AS total
      FROM creditos
      WHERE fecha_vencimiento BETWEEN $1 AND $2
        AND estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')
      GROUP BY fecha_vencimiento
      ORDER BY fecha_vencimiento ASC
    `;

    const [programaciones, ordenes, creditos] = await Promise.all([
      pool.query(programacionesQuery, [fechaInicio, fechaFin]),
      pool.query(ordenesQuery, [fechaInicio, fechaFin]),
      pool.query(creditosQuery, [fechaInicio, fechaFin]),
    ]);

    const mapa = {};

    for (const row of programaciones.rows) {
      const key = formatearFechaISO(row.fecha);
      if (!mapa[key]) {
        mapa[key] = {
          fecha: key,
          programaciones: 0,
          ordenes: 0,
          vencimientos_credito: 0,
        };
      }
      mapa[key].programaciones = row.total;
    }

    for (const row of ordenes.rows) {
      const key = formatearFechaISO(row.fecha);
      if (!mapa[key]) {
        mapa[key] = {
          fecha: key,
          programaciones: 0,
          ordenes: 0,
          vencimientos_credito: 0,
        };
      }
      mapa[key].ordenes = row.total;
    }

    for (const row of creditos.rows) {
      const key = formatearFechaISO(row.fecha);
      if (!mapa[key]) {
        mapa[key] = {
          fecha: key,
          programaciones: 0,
          ordenes: 0,
          vencimientos_credito: 0,
        };
      }
      mapa[key].vencimientos_credito = row.total;
    }

    const dias = Object.values(mapa).sort((a, b) => a.fecha.localeCompare(b.fecha));

    return res.json({
      anio: year,
      mes: month,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      dias,
    });
  } catch (error) {
    console.error("Error al obtener calendario mensual:", error);
    return apiErrorText(res, req, 500, "Error interno al obtener calendario mensual", "Internal error while loading monthly calendar");
  }
};

export const obtenerVencimientosCredito = async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, estado } = req.query;

    if (!fecha_desde || !fecha_hasta) {
      return apiErrorText(
        res,
        req,
        400,
        "Debe enviar fecha_desde y fecha_hasta en formato YYYY-MM-DD",
        "You must provide fecha_desde and fecha_hasta in YYYY-MM-DD format"
      );
    }

    let query = `
      SELECT
        cr.*,
        c.nombre_completo AS cliente,
        c.telefono,
        ot.numero_orden
      FROM creditos cr
      INNER JOIN clientes c ON cr.id_cliente = c.id_cliente
      INNER JOIN ordenes_trabajo ot ON cr.id_orden_trabajo = ot.id_orden_trabajo
      WHERE cr.fecha_vencimiento BETWEEN $1 AND $2
    `;

    const values = [fecha_desde, fecha_hasta];

    if (estado) {
      query += ` AND cr.estado = $3`;
      values.push(estado.toUpperCase());
    } else {
      query += ` AND cr.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')`;
    }

    query += ` ORDER BY cr.fecha_vencimiento ASC, cr.id_credito DESC`;

    const { rows } = await pool.query(query, values);

    return res.json({
      fecha_desde,
      fecha_hasta,
      vencimientos: rows,
      resumen: {
        total_vencimientos: rows.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener vencimientos de crédito:", error);
    return apiErrorText(
      res,
      req,
      500,
      "Error interno al obtener vencimientos de crédito",
      "Internal error while loading credit due dates"
    );
  }
};
