import { pool } from "../config/db.js";
import { registrarAuditoria } from "../utils/auditoria.js";

const TIPOS_ALERTA = [
  "SERVICIO_HOY",
  "SERVICIO_MANANA",
  "SERVICIO_ATRASADO",
  "PAGO_HOY",
  "PAGO_MANANA",
  "PAGO_VENCIDO",
];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DASHBOARD_RANGE_DAYS = 92;

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const daysBetween = (from, to) => {
  const diff = to.getTime() - from.getTime();
  return Math.floor(diff / 86400000);
};

const resolveDashboardRange = (query) => {
  const today = new Date();
  const defaultEnd = toIsoDate(today);
  const defaultStartDate = new Date(today);
  defaultStartDate.setDate(defaultStartDate.getDate() - 6);
  const defaultStart = toIsoDate(defaultStartDate);

  const fecha_desde = query.fecha_desde || defaultStart;
  const fecha_hasta = query.fecha_hasta || defaultEnd;

  if (!DATE_PATTERN.test(fecha_desde) || !DATE_PATTERN.test(fecha_hasta)) {
    return { error: "Las fechas del dashboard deben usar el formato YYYY-MM-DD" };
  }

  const desdeDate = new Date(`${fecha_desde}T00:00:00`);
  const hastaDate = new Date(`${fecha_hasta}T00:00:00`);

  if (Number.isNaN(desdeDate.getTime()) || Number.isNaN(hastaDate.getTime())) {
    return { error: "Las fechas del dashboard no son validas" };
  }

  if (desdeDate > hastaDate) {
    return { error: "La fecha desde no puede ser mayor que la fecha hasta" };
  }

  if (daysBetween(desdeDate, hastaDate) > MAX_DASHBOARD_RANGE_DAYS) {
    return { error: `El rango maximo del dashboard es de ${MAX_DASHBOARD_RANGE_DAYS + 1} dias` };
  }

  return { fecha_desde, fecha_hasta };
};

export const generarAlertas = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const hoyResult = await client.query(`SELECT CURRENT_DATE AS hoy`);
    const hoy = hoyResult.rows[0].hoy;

    const mananaResult = await client.query(`SELECT CURRENT_DATE + INTERVAL '1 day' AS manana`);
    const manana = mananaResult.rows[0].manana;

    // Servicios de hoy
    const serviciosHoy = await client.query(
      `
        SELECT
          ps.id_programacion,
          c.nombre_completo,
          p.nombre_propiedad,
          s.nombre AS servicio,
          ps.proxima_fecha
        FROM programaciones_servicio ps
        INNER JOIN clientes c ON ps.id_cliente = c.id_cliente
        INNER JOIN propiedades p ON ps.id_propiedad = p.id_propiedad
        INNER JOIN servicios s ON ps.id_servicio = s.id_servicio
        WHERE ps.estado = 'ACTIVA'
          AND ps.proxima_fecha = CURRENT_DATE
      `
    );

    for (const item of serviciosHoy.rows) {
      const existe = await client.query(
        `
          SELECT id_alerta
          FROM alertas
          WHERE tipo_alerta = 'SERVICIO_HOY'
            AND modulo_origen = 'PROGRAMACION'
            AND id_referencia = $1
            AND fecha_alerta = CURRENT_DATE
        `,
        [item.id_programacion]
      );

      if (existe.rows.length === 0) {
        await client.query(
          `
            INSERT INTO alertas (
              tipo_alerta, titulo, mensaje, modulo_origen, id_referencia, fecha_alerta
            )
            VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)
          `,
          [
            "SERVICIO_HOY",
            "Servicio programado para hoy",
            `${item.nombre_completo} - ${item.nombre_propiedad} - ${item.servicio}`,
            "PROGRAMACION",
            item.id_programacion,
          ]
        );
      }
    }

    // Servicios de mañana
    const serviciosManana = await client.query(
      `
        SELECT
          ps.id_programacion,
          c.nombre_completo,
          p.nombre_propiedad,
          s.nombre AS servicio
        FROM programaciones_servicio ps
        INNER JOIN clientes c ON ps.id_cliente = c.id_cliente
        INNER JOIN propiedades p ON ps.id_propiedad = p.id_propiedad
        INNER JOIN servicios s ON ps.id_servicio = s.id_servicio
        WHERE ps.estado = 'ACTIVA'
          AND ps.proxima_fecha = CURRENT_DATE + INTERVAL '1 day'
      `
    );

    for (const item of serviciosManana.rows) {
      const existe = await client.query(
        `
          SELECT id_alerta
          FROM alertas
          WHERE tipo_alerta = 'SERVICIO_MANANA'
            AND modulo_origen = 'PROGRAMACION'
            AND id_referencia = $1
            AND fecha_alerta = CURRENT_DATE
        `,
        [item.id_programacion]
      );

      if (existe.rows.length === 0) {
        await client.query(
          `
            INSERT INTO alertas (
              tipo_alerta, titulo, mensaje, modulo_origen, id_referencia, fecha_alerta
            )
            VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)
          `,
          [
            "SERVICIO_MANANA",
            "Servicio programado para mañana",
            `${item.nombre_completo} - ${item.nombre_propiedad} - ${item.servicio}`,
            "PROGRAMACION",
            item.id_programacion,
          ]
        );
      }
    }

    // Servicios atrasados
    const serviciosAtrasados = await client.query(
      `
        SELECT
          ps.id_programacion,
          c.nombre_completo,
          p.nombre_propiedad,
          s.nombre AS servicio,
          ps.proxima_fecha
        FROM programaciones_servicio ps
        INNER JOIN clientes c ON ps.id_cliente = c.id_cliente
        INNER JOIN propiedades p ON ps.id_propiedad = p.id_propiedad
        INNER JOIN servicios s ON ps.id_servicio = s.id_servicio
        WHERE ps.estado = 'ACTIVA'
          AND ps.proxima_fecha < CURRENT_DATE
      `
    );

    for (const item of serviciosAtrasados.rows) {
      const existe = await client.query(
        `
          SELECT id_alerta
          FROM alertas
          WHERE tipo_alerta = 'SERVICIO_ATRASADO'
            AND modulo_origen = 'PROGRAMACION'
            AND id_referencia = $1
            AND fecha_alerta = CURRENT_DATE
        `,
        [item.id_programacion]
      );

      if (existe.rows.length === 0) {
        await client.query(
          `
            INSERT INTO alertas (
              tipo_alerta, titulo, mensaje, modulo_origen, id_referencia, fecha_alerta
            )
            VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)
          `,
          [
            "SERVICIO_ATRASADO",
            "Servicio atrasado",
            `${item.nombre_completo} - ${item.nombre_propiedad} - ${item.servicio} - pendiente desde ${item.proxima_fecha}`,
            "PROGRAMACION",
            item.id_programacion,
          ]
        );
      }
    }

    // Créditos que vencen hoy
    const pagosHoy = await client.query(
      `
        SELECT
          cr.id_credito,
          c.nombre_completo,
          ot.numero_orden,
          cr.saldo_pendiente
        FROM creditos cr
        INNER JOIN clientes c ON cr.id_cliente = c.id_cliente
        INNER JOIN ordenes_trabajo ot ON cr.id_orden_trabajo = ot.id_orden_trabajo
        WHERE cr.estado IN ('PENDIENTE', 'PARCIAL')
          AND cr.fecha_vencimiento = CURRENT_DATE
      `
    );

    for (const item of pagosHoy.rows) {
      const existe = await client.query(
        `
          SELECT id_alerta
          FROM alertas
          WHERE tipo_alerta = 'PAGO_HOY'
            AND modulo_origen = 'CREDITO'
            AND id_referencia = $1
            AND fecha_alerta = CURRENT_DATE
        `,
        [item.id_credito]
      );

      if (existe.rows.length === 0) {
        await client.query(
          `
            INSERT INTO alertas (
              tipo_alerta, titulo, mensaje, modulo_origen, id_referencia, fecha_alerta
            )
            VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)
          `,
          [
            "PAGO_HOY",
            "Crédito vence hoy",
            `${item.nombre_completo} - Orden ${item.numero_orden} - Saldo Q${item.saldo_pendiente}`,
            "CREDITO",
            item.id_credito,
          ]
        );
      }
    }

    // Créditos que vencen mañana
    const pagosManana = await client.query(
      `
        SELECT
          cr.id_credito,
          c.nombre_completo,
          ot.numero_orden,
          cr.saldo_pendiente
        FROM creditos cr
        INNER JOIN clientes c ON cr.id_cliente = c.id_cliente
        INNER JOIN ordenes_trabajo ot ON cr.id_orden_trabajo = ot.id_orden_trabajo
        WHERE cr.estado IN ('PENDIENTE', 'PARCIAL')
          AND cr.fecha_vencimiento = CURRENT_DATE + INTERVAL '1 day'
      `
    );

    for (const item of pagosManana.rows) {
      const existe = await client.query(
        `
          SELECT id_alerta
          FROM alertas
          WHERE tipo_alerta = 'PAGO_MANANA'
            AND modulo_origen = 'CREDITO'
            AND id_referencia = $1
            AND fecha_alerta = CURRENT_DATE
        `,
        [item.id_credito]
      );

      if (existe.rows.length === 0) {
        await client.query(
          `
            INSERT INTO alertas (
              tipo_alerta, titulo, mensaje, modulo_origen, id_referencia, fecha_alerta
            )
            VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)
          `,
          [
            "PAGO_MANANA",
            "Crédito vence mañana",
            `${item.nombre_completo} - Orden ${item.numero_orden} - Saldo Q${item.saldo_pendiente}`,
            "CREDITO",
            item.id_credito,
          ]
        );
      }
    }

    // Créditos vencidos
    const pagosVencidos = await client.query(
      `
        SELECT
          cr.id_credito,
          c.nombre_completo,
          ot.numero_orden,
          cr.saldo_pendiente,
          cr.fecha_vencimiento
        FROM creditos cr
        INNER JOIN clientes c ON cr.id_cliente = c.id_cliente
        INNER JOIN ordenes_trabajo ot ON cr.id_orden_trabajo = ot.id_orden_trabajo
        WHERE cr.estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')
          AND cr.fecha_vencimiento < CURRENT_DATE
      `
    );

    for (const item of pagosVencidos.rows) {
      const existe = await client.query(
        `
          SELECT id_alerta
          FROM alertas
          WHERE tipo_alerta = 'PAGO_VENCIDO'
            AND modulo_origen = 'CREDITO'
            AND id_referencia = $1
            AND fecha_alerta = CURRENT_DATE
        `,
        [item.id_credito]
      );

      if (existe.rows.length === 0) {
        await client.query(
          `
            INSERT INTO alertas (
              tipo_alerta, titulo, mensaje, modulo_origen, id_referencia, fecha_alerta
            )
            VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)
          `,
          [
            "PAGO_VENCIDO",
            "Crédito vencido",
            `${item.nombre_completo} - Orden ${item.numero_orden} - Venció ${item.fecha_vencimiento} - Saldo Q${item.saldo_pendiente}`,
            "CREDITO",
            item.id_credito,
          ]
        );
      }

      const creditoAnteriorResult = await client.query(
        `SELECT * FROM creditos WHERE id_credito = $1`,
        [item.id_credito]
      );

      const creditoAnterior = creditoAnteriorResult.rows[0];

      const creditoActualizadoResult = await client.query(
        `
          UPDATE creditos
          SET estado = 'VENCIDO',
              updated_at = NOW()
          WHERE id_credito = $1
            AND estado <> 'PAGADO'
            AND estado <> 'CANCELADO'
            AND estado <> 'VENCIDO'
          RETURNING *
        `,
        [item.id_credito]
      );

      if (creditoActualizadoResult.rows.length > 0) {
        const creditoActualizado = creditoActualizadoResult.rows[0];

        await registrarAuditoria({
          tabla_afectada: "creditos",
          id_registro: creditoActualizado.id_credito,
          accion: "CAMBIAR_ESTADO",
          descripcion: `Se marcó el crédito ${creditoActualizado.id_credito} como VENCIDO (orden ${item.numero_orden})`,
          valores_anteriores: creditoAnterior,
          valores_nuevos: creditoActualizado,
          realizado_por: req.user?.id_usuario || null,
          client,
        });
      }
    }

    await client.query("COMMIT");

    return res.json({
      mensaje: "Alertas generadas correctamente",
      resumen: {
        servicios_hoy: serviciosHoy.rows.length,
        servicios_manana: serviciosManana.rows.length,
        servicios_atrasados: serviciosAtrasados.rows.length,
        pagos_hoy: pagosHoy.rows.length,
        pagos_manana: pagosManana.rows.length,
        pagos_vencidos: pagosVencidos.rows.length,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al generar alertas:", error);
    return res.status(500).json({ error: "Error interno al generar alertas" });
  } finally {
    client.release();
  }
};

export const listarAlertas = async (req, res) => {
  try {
    const { leida, tipo_alerta, modulo_origen, fecha_desde, fecha_hasta } = req.query;
    const { page, limit, offset } = req.pagination || { page: 1, limit: 50, offset: 0 };

    let whereClause = ` WHERE 1=1 `;
    const values = [];
    let index = 1;

    if (leida !== undefined) {
      whereClause += ` AND leida = $${index}`;
      values.push(leida === "true");
      index++;
    }

    if (tipo_alerta) {
      if (!TIPOS_ALERTA.includes(tipo_alerta.toUpperCase())) {
        return res.status(400).json({ error: "Tipo de alerta inválido" });
      }

      whereClause += ` AND tipo_alerta = $${index}`;
      values.push(tipo_alerta.toUpperCase());
      index++;
    }

    if (modulo_origen) {
      whereClause += ` AND modulo_origen = $${index}`;
      values.push(modulo_origen.toUpperCase());
      index++;
    }

    if (fecha_desde) {
      whereClause += ` AND fecha_alerta >= $${index}`;
      values.push(fecha_desde);
      index++;
    }

    if (fecha_hasta) {
      whereClause += ` AND fecha_alerta <= $${index}`;
      values.push(fecha_hasta);
      index++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM alertas ${whereClause}`,
      values
    );
    const total = countResult.rows[0].total;

    const dataQuery = `
      SELECT *
      FROM alertas
      ${whereClause}
      ORDER BY leida ASC, fecha_alerta DESC, id_alerta DESC
      LIMIT $${index} OFFSET $${index + 1}
    `;

    const { rows } = await pool.query(dataQuery, [...values, limit, offset]);

    return res.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error al listar alertas:", error);
    return res.status(500).json({ error: "Error interno al listar alertas" });
  }
};

export const marcarAlertaLeida = async (req, res) => {
  try {
    const { id } = req.params;
    const { leida } = req.body;

    const query = `
      UPDATE alertas
      SET leida = $1
      WHERE id_alerta = $2
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [leida ?? true, id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Alerta no encontrada" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al marcar alerta:", error);
    return res.status(500).json({ error: "Error interno al marcar alerta" });
  }
};

export const marcarTodasLeidas = async (_req, res) => {
  try {
    const query = `
      UPDATE alertas
      SET leida = true
      WHERE leida = false
      RETURNING *;
    `;

    const { rows } = await pool.query(query);

    return res.json({
      mensaje: "Todas las alertas fueron marcadas como leídas",
      cantidad: rows.length,
    });
  } catch (error) {
    console.error("Error al marcar todas las alertas:", error);
    return res.status(500).json({ error: "Error interno al marcar todas las alertas" });
  }
};

export const eliminarAlerta = async (req, res) => {
  try {
    const { id } = req.params;

    const anteriorResult = await pool.query(
      `SELECT * FROM alertas WHERE id_alerta = $1`,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return res.status(404).json({ error: "Alerta no encontrada" });
    }

    const anterior = anteriorResult.rows[0];

    if (anterior.archivada === true) {
      return res.status(400).json({ error: "La alerta ya está archivada" });
    }

    const query = `
      UPDATE alertas
      SET archivada = true,
          leida = true
      WHERE id_alerta = $1
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [id]);
    const alerta = rows[0];

    return res.json(alerta);
  } catch (error) {
    console.error("Error al eliminar alerta:", error);
    return res.status(500).json({ error: "Error interno al eliminar alerta" });
  }
};

export const obtenerDashboardBase = async (_req, res) => {
  try {
    const range = resolveDashboardRange(_req.query || {});

    if (range.error) {
      return res.status(400).json({ error: range.error });
    }

    const { fecha_desde, fecha_hasta } = range;

    const serviciosHoy = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM programaciones_servicio
        WHERE estado = 'ACTIVA'
          AND proxima_fecha = CURRENT_DATE
      `
    );

    const serviciosManana = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM programaciones_servicio
        WHERE estado = 'ACTIVA'
          AND proxima_fecha = CURRENT_DATE + INTERVAL '1 day'
      `
    );

    const serviciosAtrasados = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM programaciones_servicio
        WHERE estado = 'ACTIVA'
          AND proxima_fecha < CURRENT_DATE
      `
    );

    const creditosVencidos = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM creditos
        WHERE estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')
          AND fecha_vencimiento < CURRENT_DATE
      `
    );

    const pagosHoy = await pool.query(
      `
        SELECT COALESCE(SUM(monto), 0)::numeric AS total
        FROM pagos
        WHERE fecha_pago = CURRENT_DATE
      `
    );

    const ingresosMes = await pool.query(
      `
        SELECT COALESCE(SUM(monto), 0)::numeric AS total
        FROM pagos
        WHERE DATE_TRUNC('month', fecha_pago) = DATE_TRUNC('month', CURRENT_DATE)
      `
    );

    const clientesActivos = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM clientes
        WHERE estado = 'ACTIVO'
      `
    );

    const alertasNoLeidas = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM alertas
        WHERE leida = false
      `
    );

    const ultimasAlertas = await pool.query(
      `
        SELECT *
        FROM alertas
        WHERE fecha_alerta BETWEEN $1 AND $2
        ORDER BY leida ASC, fecha_alerta DESC, id_alerta DESC
        LIMIT 10
      `,
      [fecha_desde, fecha_hasta]
    );

    const serieDiaria = await pool.query(
      `
        WITH serie AS (
          SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS fecha
        ),
        servicios AS (
          SELECT
            proxima_fecha::date AS fecha,
            COUNT(*)::int AS total
          FROM programaciones_servicio
          WHERE estado = 'ACTIVA'
            AND proxima_fecha BETWEEN $1 AND $2
          GROUP BY proxima_fecha::date
        ),
        pagos_periodo AS (
          SELECT
            fecha_pago::date AS fecha,
            COALESCE(SUM(monto), 0)::numeric AS total
          FROM pagos
          WHERE fecha_pago BETWEEN $1 AND $2
          GROUP BY fecha_pago::date
        ),
        alertas_periodo AS (
          SELECT
            fecha_alerta::date AS fecha,
            COUNT(*)::int AS total
          FROM alertas
          WHERE fecha_alerta BETWEEN $1 AND $2
          GROUP BY fecha_alerta::date
        )
        SELECT
          serie.fecha,
          COALESCE(servicios.total, 0)::int AS servicios_programados,
          COALESCE(pagos_periodo.total, 0)::numeric AS pagos_cobrados,
          COALESCE(alertas_periodo.total, 0)::int AS alertas_creadas
        FROM serie
        LEFT JOIN servicios
          ON servicios.fecha = serie.fecha
        LEFT JOIN pagos_periodo
          ON pagos_periodo.fecha = serie.fecha
        LEFT JOIN alertas_periodo
          ON alertas_periodo.fecha = serie.fecha
        ORDER BY serie.fecha ASC
      `,
      [fecha_desde, fecha_hasta]
    );

    const totalesPeriodo = serieDiaria.rows.reduce(
      (acc, item) => ({
        servicios_programados: acc.servicios_programados + Number(item.servicios_programados || 0),
        pagos_cobrados: Number(acc.pagos_cobrados) + Number(item.pagos_cobrados || 0),
        alertas_creadas: acc.alertas_creadas + Number(item.alertas_creadas || 0),
      }),
      { servicios_programados: 0, pagos_cobrados: 0, alertas_creadas: 0 }
    );

    return res.json({
      periodo: { fecha_desde, fecha_hasta },
      resumen: {
        servicios_hoy: serviciosHoy.rows[0].total,
        servicios_manana: serviciosManana.rows[0].total,
        servicios_atrasados: serviciosAtrasados.rows[0].total,
        creditos_vencidos: creditosVencidos.rows[0].total,
        pagos_hoy: pagosHoy.rows[0].total,
        ingresos_mes: ingresosMes.rows[0].total,
        clientes_activos: clientesActivos.rows[0].total,
        alertas_no_leidas: alertasNoLeidas.rows[0].total,
      },
      serie_diaria: serieDiaria.rows,
      totales_periodo: totalesPeriodo,
      ultimas_alertas: ultimasAlertas.rows,
    });
  } catch (error) {
    console.error("Error al obtener dashboard base:", error);
    return res.status(500).json({ error: "Error interno al obtener dashboard base" });
  }
};
