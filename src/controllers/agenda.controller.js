import { pool } from "../config/db.js";

const formatearFechaISO = (fecha) => {
  if (!fecha) return null;
  return new Date(fecha).toISOString().split("T")[0];
};

export const obtenerAgendaDia = async (req, res) => {
  try {
    const { fecha } = req.query;

    if (!fecha) {
      return res.status(400).json({ error: "Debe enviar la fecha en formato YYYY-MM-DD" });
    }

    const programacionesQuery = `
      SELECT
        ps.id_programacion,
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
        cu.nombre AS cuadrilla
      FROM programaciones_servicio ps
      INNER JOIN clientes c ON ps.id_cliente = c.id_cliente
      INNER JOIN propiedades p ON ps.id_propiedad = p.id_propiedad
      INNER JOIN servicios s ON ps.id_servicio = s.id_servicio
      INNER JOIN categorias_servicio cs ON s.id_categoria_servicio = cs.id_categoria_servicio
      LEFT JOIN cuadrillas cu ON ps.id_cuadrilla = cu.id_cuadrilla
      WHERE ps.proxima_fecha = $1
        AND ps.estado = 'ACTIVA'
      ORDER BY ps.hora_programada ASC NULLS LAST, ps.id_programacion ASC
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
        cu.nombre AS cuadrilla
      FROM ordenes_trabajo ot
      INNER JOIN clientes c ON ot.id_cliente = c.id_cliente
      INNER JOIN propiedades p ON ot.id_propiedad = p.id_propiedad
      LEFT JOIN cuadrillas cu ON ot.id_cuadrilla = cu.id_cuadrilla
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

    const [programaciones, ordenes, creditos] = await Promise.all([
      pool.query(programacionesQuery, [fecha]),
      pool.query(ordenesQuery, [fecha]),
      pool.query(creditosQuery, [fecha]),
    ]);

    return res.json({
      fecha,
      programaciones: programaciones.rows,
      ordenes: ordenes.rows,
      vencimientos_credito: creditos.rows,
      resumen: {
        total_programaciones: programaciones.rows.length,
        total_ordenes: ordenes.rows.length,
        total_vencimientos_credito: creditos.rows.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener agenda del día:", error);
    return res.status(500).json({ error: "Error interno al obtener agenda del día" });
  }
};

export const obtenerAgendaRango = async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta } = req.query;

    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        error: "Debe enviar fecha_desde y fecha_hasta en formato YYYY-MM-DD",
      });
    }

    const programacionesQuery = `
      SELECT
        ps.id_programacion,
        ps.proxima_fecha,
        ps.hora_programada,
        ps.frecuencia,
        ps.prioridad,
        ps.estado,
        c.nombre_completo AS cliente,
        p.nombre_propiedad,
        s.nombre AS servicio,
        cs.nombre AS categoria_servicio,
        cu.nombre AS cuadrilla
      FROM programaciones_servicio ps
      INNER JOIN clientes c ON ps.id_cliente = c.id_cliente
      INNER JOIN propiedades p ON ps.id_propiedad = p.id_propiedad
      INNER JOIN servicios s ON ps.id_servicio = s.id_servicio
      INNER JOIN categorias_servicio cs ON s.id_categoria_servicio = cs.id_categoria_servicio
      LEFT JOIN cuadrillas cu ON ps.id_cuadrilla = cu.id_cuadrilla
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
    return res.status(500).json({ error: "Error interno al obtener agenda por rango" });
  }
};

export const obtenerCalendarioMensual = async (req, res) => {
  try {
    const { anio, mes } = req.query;

    if (!anio || !mes) {
      return res.status(400).json({ error: "Debe enviar anio y mes" });
    }

    const year = Number(anio);
    const month = Number(mes);

    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: "Mes o año inválidos" });
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
    return res.status(500).json({ error: "Error interno al obtener calendario mensual" });
  }
};

export const obtenerVencimientosCredito = async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, estado } = req.query;

    if (!fecha_desde || !fecha_hasta) {
      return res.status(400).json({
        error: "Debe enviar fecha_desde y fecha_hasta en formato YYYY-MM-DD",
      });
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
    return res.status(500).json({ error: "Error interno al obtener vencimientos de crédito" });
  }
};