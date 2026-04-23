import { pool } from "../config/db.js";

export const obtenerResumenFinancieroOrden = async (req, res) => {
  try {
    const { id_orden_trabajo } = req.params;

    const ordenQuery = `
      SELECT
        ot.*,
        c.nombre_completo AS cliente,
        c.nombre_empresa,
        p.nombre_propiedad
      FROM ordenes_trabajo ot
      INNER JOIN clientes c
        ON ot.id_cliente = c.id_cliente
      INNER JOIN propiedades p
        ON ot.id_propiedad = p.id_propiedad
      WHERE ot.id_orden_trabajo = $1
    `;

    const ordenResult = await pool.query(ordenQuery, [id_orden_trabajo]);

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    const detallesQuery = `
      SELECT
        d.*,
        s.nombre AS servicio
      FROM ordenes_trabajo_detalle d
      INNER JOIN servicios s
        ON d.id_servicio = s.id_servicio
      WHERE d.id_orden_trabajo = $1
      ORDER BY d.id_orden_detalle ASC
    `;

    const detallesResult = await pool.query(detallesQuery, [id_orden_trabajo]);

    const pagosDirectosQuery = `
      SELECT
        p.*
      FROM pagos p
      WHERE p.id_orden_trabajo = $1
        AND p.id_pago NOT IN (
          SELECT pc.id_pago
          FROM pagos_credito pc
        )
      ORDER BY p.id_pago DESC
    `;

    const pagosDirectosResult = await pool.query(pagosDirectosQuery, [id_orden_trabajo]);

    const totalPagosDirectosQuery = `
      SELECT COALESCE(SUM(monto), 0)::numeric AS total
      FROM pagos
      WHERE id_orden_trabajo = $1
        AND id_pago NOT IN (
          SELECT id_pago FROM pagos_credito
        )
    `;

    const totalPagosDirectosResult = await pool.query(totalPagosDirectosQuery, [id_orden_trabajo]);

    const creditoQuery = `
      SELECT *
      FROM creditos
      WHERE id_orden_trabajo = $1
      ORDER BY id_credito DESC
      LIMIT 1
    `;

    const creditoResult = await pool.query(creditoQuery, [id_orden_trabajo]);

    let credito = null;
    let pagosCredito = [];
    let totalPagadoCredito = 0;
    let saldoPendienteCredito = 0;

    if (creditoResult.rows.length > 0) {
      credito = creditoResult.rows[0];

      const pagosCreditoQuery = `
        SELECT
          pc.id_pago_credito,
          pc.monto_aplicado,
          pc.created_at,
          p.id_pago,
          p.fecha_pago,
          p.metodo_pago,
          p.referencia_pago,
          p.observaciones,
          p.monto
        FROM pagos_credito pc
        INNER JOIN pagos p
          ON pc.id_pago = p.id_pago
        WHERE pc.id_credito = $1
        ORDER BY pc.id_pago_credito DESC
      `;

      const pagosCreditoResult = await pool.query(pagosCreditoQuery, [credito.id_credito]);
      pagosCredito = pagosCreditoResult.rows;

      const totalPagadoCreditoQuery = `
        SELECT COALESCE(SUM(monto_aplicado), 0)::numeric AS total
        FROM pagos_credito
        WHERE id_credito = $1
      `;

      const totalPagadoCreditoResult = await pool.query(totalPagadoCreditoQuery, [credito.id_credito]);
      totalPagadoCredito = Number(totalPagadoCreditoResult.rows[0].total || 0);
      saldoPendienteCredito = Number(credito.saldo_pendiente || 0);
    }

    const totalOrden = Number(ordenResult.rows[0].total_orden || 0);
    const totalPagosDirectos = Number(totalPagosDirectosResult.rows[0].total || 0);
    const totalRecibido = totalPagosDirectos + totalPagadoCredito;
    const saldoGeneral = Number((totalOrden - totalRecibido).toFixed(2));

    return res.json({
      orden: ordenResult.rows[0],
      detalles: detallesResult.rows,
      pagos_directos: pagosDirectosResult.rows,
      credito,
      pagos_credito: pagosCredito,
      resumen_financiero: {
        total_orden: totalOrden,
        total_pagado_directo: totalPagosDirectos,
        total_pagado_credito: totalPagadoCredito,
        total_recibido: totalRecibido,
        saldo_pendiente_credito: saldoPendienteCredito,
        saldo_general_orden: saldoGeneral < 0 ? 0 : saldoGeneral,
      },
    });
  } catch (error) {
    console.error("Error al obtener resumen financiero de la orden:", error);
    return res.status(500).json({ error: "Error interno al obtener resumen financiero de la orden" });
  }
};

export const obtenerPerfilCompletoCliente = async (req, res) => {
  try {
    const { id_cliente } = req.params;

    const clienteQuery = `
      SELECT *
      FROM clientes
      WHERE id_cliente = $1
    `;

    const clienteResult = await pool.query(clienteQuery, [id_cliente]);

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const propiedadesQuery = `
      SELECT *
      FROM propiedades
      WHERE id_cliente = $1
      ORDER BY id_propiedad DESC
    `;

    const propiedadesResult = await pool.query(propiedadesQuery, [id_cliente]);

    const programacionesQuery = `
      SELECT
        ps.*,
        p.nombre_propiedad,
        s.nombre AS servicio,
        cs.nombre AS categoria_servicio,
        cu.nombre AS cuadrilla
      FROM programaciones_servicio ps
      INNER JOIN propiedades p
        ON ps.id_propiedad = p.id_propiedad
      INNER JOIN servicios s
        ON ps.id_servicio = s.id_servicio
      INNER JOIN categorias_servicio cs
        ON s.id_categoria_servicio = cs.id_categoria_servicio
      LEFT JOIN cuadrillas cu
        ON ps.id_cuadrilla = cu.id_cuadrilla
      WHERE ps.id_cliente = $1
      ORDER BY ps.proxima_fecha ASC, ps.id_programacion DESC
    `;

    const programacionesResult = await pool.query(programacionesQuery, [id_cliente]);

    const ordenesQuery = `
      SELECT
        ot.*,
        p.nombre_propiedad,
        cu.nombre AS cuadrilla
      FROM ordenes_trabajo ot
      INNER JOIN propiedades p
        ON ot.id_propiedad = p.id_propiedad
      LEFT JOIN cuadrillas cu
        ON ot.id_cuadrilla = cu.id_cuadrilla
      WHERE ot.id_cliente = $1
      ORDER BY ot.fecha_servicio DESC, ot.id_orden_trabajo DESC
      LIMIT 20
    `;

    const ordenesResult = await pool.query(ordenesQuery, [id_cliente]);

    const pagosQuery = `
      SELECT
        p.*,
        ot.numero_orden
      FROM pagos p
      LEFT JOIN ordenes_trabajo ot
        ON p.id_orden_trabajo = ot.id_orden_trabajo
      WHERE p.id_cliente = $1
      ORDER BY p.fecha_pago DESC, p.id_pago DESC
      LIMIT 50
    `;

    const pagosResult = await pool.query(pagosQuery, [id_cliente]);

    const creditosQuery = `
      SELECT
        cr.*,
        ot.numero_orden
      FROM creditos cr
      INNER JOIN ordenes_trabajo ot
        ON cr.id_orden_trabajo = ot.id_orden_trabajo
      WHERE cr.id_cliente = $1
      ORDER BY cr.id_credito DESC
    `;

    const creditosResult = await pool.query(creditosQuery, [id_cliente]);

    const resumenFinancieroQuery = `
      SELECT
        COALESCE((
          SELECT SUM(monto)
          FROM pagos
          WHERE id_cliente = $1
        ), 0)::numeric AS total_pagado,
        COALESCE((
          SELECT SUM(saldo_pendiente)
          FROM creditos
          WHERE id_cliente = $1
            AND estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')
        ), 0)::numeric AS saldo_pendiente,
        COALESCE((
          SELECT COUNT(*)
          FROM creditos
          WHERE id_cliente = $1
            AND estado IN ('PENDIENTE', 'PARCIAL', 'VENCIDO')
        ), 0)::int AS creditos_activos,
        COALESCE((
          SELECT COUNT(*)
          FROM ordenes_trabajo
          WHERE id_cliente = $1
        ), 0)::int AS total_ordenes,
        COALESCE((
          SELECT COUNT(*)
          FROM programaciones_servicio
          WHERE id_cliente = $1
            AND estado = 'ACTIVA'
        ), 0)::int AS programaciones_activas
    `;

    const resumenFinancieroResult = await pool.query(resumenFinancieroQuery, [id_cliente]);

    return res.json({
      cliente: clienteResult.rows[0],
      propiedades: propiedadesResult.rows,
      programaciones: programacionesResult.rows,
      ordenes: ordenesResult.rows,
      pagos: pagosResult.rows,
      creditos: creditosResult.rows,
      resumen: resumenFinancieroResult.rows[0],
    });
  } catch (error) {
    console.error("Error al obtener perfil completo del cliente:", error);
    return res.status(500).json({ error: "Error interno al obtener perfil completo del cliente" });
  }
};