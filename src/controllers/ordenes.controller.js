import { pool } from "../config/db.js";
import { registrarAuditoria } from "../utils/auditoria.js";

const TIPOS_VISITA_VALIDOS = ["PROGRAMADA", "EXTRA", "URGENTE"];
const ORIGENES_VALIDOS = ["MANUAL", "PROGRAMACION", "COTIZACION"];
const ESTADOS_ORDEN_VALIDOS = [
  "PENDIENTE",
  "PROGRAMADA",
  "EN_PROCESO",
  "COMPLETADA",
  "REPROGRAMADA",
  "CANCELADA",
];
const ESTADOS_DETALLE_VALIDOS = [
  "PENDIENTE",
  "EN_PROCESO",
  "COMPLETADO",
  "CANCELADO",
];

const generarNumeroOrden = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");

  return `OT-${y}${m}${d}-${h}${min}${s}`;
};

const recalcularTotalesOrden = async (client, id_orden_trabajo, descuento = null) => {
  const subtotalResult = await client.query(
    `
      SELECT COALESCE(SUM(subtotal), 0) AS subtotal
      FROM ordenes_trabajo_detalle
      WHERE id_orden_trabajo = $1
    `,
    [id_orden_trabajo]
  );

  const subtotal = Number(subtotalResult.rows[0].subtotal || 0);

  let descuentoFinal = descuento;

  if (descuentoFinal === null) {
    const ordenActual = await client.query(
      `SELECT descuento FROM ordenes_trabajo WHERE id_orden_trabajo = $1`,
      [id_orden_trabajo]
    );
    descuentoFinal = Number(ordenActual.rows[0]?.descuento || 0);
  }

  const total = subtotal - descuentoFinal;

  const ordenActualizada = await client.query(
    `
      UPDATE ordenes_trabajo
      SET subtotal = $1,
          total_orden = $2,
          updated_at = NOW()
      WHERE id_orden_trabajo = $3
      RETURNING *;
    `,
    [subtotal, total < 0 ? 0 : total, id_orden_trabajo]
  );

  return ordenActualizada.rows[0];
};

export const crearOrdenTrabajo = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      id_cliente,
      id_propiedad,
      id_cuadrilla,
      fecha_servicio,
      tipo_visita,
      origen,
      hora_inicio_programada,
      hora_inicio_real,
      hora_fin_real,
      duracion_real_min,
      descuento,
      costo_estimado,
      observaciones_previas,
      observaciones_finales,
      confirmado_por_cliente,
      nombre_recibe,
      firma_cliente_url,
      detalles,
    } = req.body;

    if (!id_cliente) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El cliente es obligatorio" });
    }

    if (!id_propiedad) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "La propiedad es obligatoria" });
    }

    if (!fecha_servicio) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "La fecha de servicio es obligatoria" });
    }

    if (!Array.isArray(detalles) || detalles.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Debe enviar al menos un detalle de servicio" });
    }

    const tipoVisitaFinal = (tipo_visita || "PROGRAMADA").toUpperCase();
    if (!TIPOS_VISITA_VALIDOS.includes(tipoVisitaFinal)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Tipo de visita inválido" });
    }

    const origenFinal = (origen || "MANUAL").toUpperCase();
    if (!ORIGENES_VALIDOS.includes(origenFinal)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Origen inválido" });
    }

    const descuentoFinal = descuento === undefined || descuento === null ? 0 : Number(descuento);
    if (descuentoFinal < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El descuento no puede ser negativo" });
    }

    if (duracion_real_min !== undefined && duracion_real_min !== null && Number(duracion_real_min) < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "La duración real no puede ser negativa" });
    }

    if (costo_estimado !== undefined && costo_estimado !== null && Number(costo_estimado) < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El costo estimado no puede ser negativo" });
    }

    const clienteResult = await client.query(
      `SELECT id_cliente, estado FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (clienteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "El cliente no existe" });
    }

    if (clienteResult.rows[0].estado !== "ACTIVO") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No se puede crear orden para un cliente inactivo" });
    }

    const propiedadResult = await client.query(
      `SELECT id_propiedad, id_cliente, estado FROM propiedades WHERE id_propiedad = $1`,
      [id_propiedad]
    );

    if (propiedadResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "La propiedad no existe" });
    }

    if (propiedadResult.rows[0].estado !== "ACTIVA") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No se puede usar una propiedad inactiva" });
    }

    if (Number(propiedadResult.rows[0].id_cliente) !== Number(id_cliente)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "La propiedad no pertenece al cliente seleccionado" });
    }

    if (id_cuadrilla) {
      const cuadrillaResult = await client.query(
        `SELECT id_cuadrilla, estado FROM cuadrillas WHERE id_cuadrilla = $1`,
        [id_cuadrilla]
      );

      if (cuadrillaResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "La cuadrilla no existe" });
      }

      if (cuadrillaResult.rows[0].estado !== "ACTIVA") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "No se puede usar una cuadrilla inactiva" });
      }
    }

    const numero_orden = generarNumeroOrden();

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
          hora_inicio_real,
          hora_fin_real,
          duracion_real_min,
          descuento,
          costo_estimado,
          observaciones_previas,
          observaciones_finales,
          confirmado_por_cliente,
          nombre_recibe,
          firma_cliente_url
          created_by,
          updated_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, req.user?.id_usuario || null,
req.user?.id_usuario || null, )
        RETURNING *;
      `,
      [
        numero_orden,
        id_cliente,
        id_propiedad,
        id_cuadrilla || null,
        fecha_servicio,
        tipoVisitaFinal,
        origenFinal,
        hora_inicio_programada || null,
        hora_inicio_real || null,
        hora_fin_real || null,
        duracion_real_min ?? null,
        descuentoFinal,
        costo_estimado ?? null,
        observaciones_previas?.trim() || null,
        observaciones_finales?.trim() || null,
        confirmado_por_cliente ?? false,
        nombre_recibe?.trim() || null,
        firma_cliente_url?.trim() || null,
      ]
    );

    const orden = ordenResult.rows[0];

    for (const detalle of detalles) {
      const {
        id_servicio,
        id_programacion,
        descripcion_servicio,
        cantidad,
        precio_unitario,
        descripcion_precio,
        duracion_estimada_min,
        duracion_real_min,
        estado,
        observaciones,
      } = detalle;

      if (!id_servicio) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Cada detalle debe incluir id_servicio" });
      }

      const cantidadFinal = Number(cantidad ?? 1);
      if (cantidadFinal <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "La cantidad debe ser mayor a 0" });
      }

      const precioUnitarioFinal = Number(precio_unitario ?? 0);
      if (precioUnitarioFinal < 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "El precio unitario no puede ser negativo" });
      }

      if (
        duracion_estimada_min !== undefined &&
        duracion_estimada_min !== null &&
        Number(duracion_estimada_min) < 0
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "La duración estimada no puede ser negativa" });
      }

      if (
        duracion_real_min !== undefined &&
        duracion_real_min !== null &&
        Number(duracion_real_min) < 0
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "La duración real del detalle no puede ser negativa" });
      }

      const estadoDetalleFinal = (estado || "PENDIENTE").toUpperCase();
      if (!ESTADOS_DETALLE_VALIDOS.includes(estadoDetalleFinal)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Estado de detalle inválido" });
      }

      const servicioResult = await client.query(
        `SELECT id_servicio, estado FROM servicios WHERE id_servicio = $1`,
        [id_servicio]
      );

      if (servicioResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: `El servicio ${id_servicio} no existe` });
      }

      if (servicioResult.rows[0].estado !== "ACTIVO") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `El servicio ${id_servicio} está inactivo` });
      }

      if (id_programacion) {
        const programacionResult = await client.query(
          `
            SELECT id_programacion, id_cliente, id_propiedad, id_servicio
            FROM programaciones_servicio
            WHERE id_programacion = $1
          `,
          [id_programacion]
        );

        if (programacionResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: `La programación ${id_programacion} no existe` });
        }

        const prog = programacionResult.rows[0];

        if (Number(prog.id_cliente) !== Number(id_cliente)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: `La programación ${id_programacion} no pertenece al cliente seleccionado`,
          });
        }

        if (Number(prog.id_propiedad) !== Number(id_propiedad)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: `La programación ${id_programacion} no pertenece a la propiedad seleccionada`,
          });
        }

        if (Number(prog.id_servicio) !== Number(id_servicio)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: `La programación ${id_programacion} no corresponde al servicio seleccionado`,
          });
        }
      }

      const subtotal = Number((cantidadFinal * precioUnitarioFinal).toFixed(2));

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
            duracion_real_min,
            estado,
            observaciones
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `,
        [
          orden.id_orden_trabajo,
          id_servicio,
          id_programacion || null,
          descripcion_servicio?.trim() || null,
          cantidadFinal,
          precioUnitarioFinal,
          descripcion_precio?.trim() || null,
          subtotal,
          duracion_estimada_min ?? null,
          duracion_real_min ?? null,
          estadoDetalleFinal,
          observaciones?.trim() || null,
        ]
      );
    }

    const ordenFinal = await recalcularTotalesOrden(client, orden.id_orden_trabajo, descuentoFinal);

    await client.query("COMMIT");

    return res.status(201).json(ordenFinal);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al crear orden de trabajo:", error);
    return res.status(500).json({ error: "Error interno al crear orden de trabajo" });
  } finally {
    client.release();
  }
};

export const listarOrdenesTrabajo = async (req, res) => {
  try {
    const {
      estado,
      id_cliente,
      id_propiedad,
      id_cuadrilla,
      fecha_desde,
      fecha_hasta,
      tipo_visita,
      origen,
    } = req.query;

    let query = `
      SELECT
        ot.*,
        c.nombre_completo AS cliente,
        p.nombre_propiedad,
        cu.nombre AS cuadrilla
      FROM ordenes_trabajo ot
      INNER JOIN clientes c
        ON ot.id_cliente = c.id_cliente
      INNER JOIN propiedades p
        ON ot.id_propiedad = p.id_propiedad
      LEFT JOIN cuadrillas cu
        ON ot.id_cuadrilla = cu.id_cuadrilla
      WHERE 1=1
    `;

    const values = [];
    let index = 1;

    if (estado) {
      query += ` AND ot.estado = $${index}`;
      values.push(estado.toUpperCase());
      index++;
    }

    if (id_cliente) {
      query += ` AND ot.id_cliente = $${index}`;
      values.push(id_cliente);
      index++;
    }

    if (id_propiedad) {
      query += ` AND ot.id_propiedad = $${index}`;
      values.push(id_propiedad);
      index++;
    }

    if (id_cuadrilla) {
      query += ` AND ot.id_cuadrilla = $${index}`;
      values.push(id_cuadrilla);
      index++;
    }

    if (fecha_desde) {
      query += ` AND ot.fecha_servicio >= $${index}`;
      values.push(fecha_desde);
      index++;
    }

    if (fecha_hasta) {
      query += ` AND ot.fecha_servicio <= $${index}`;
      values.push(fecha_hasta);
      index++;
    }

    if (tipo_visita) {
      query += ` AND ot.tipo_visita = $${index}`;
      values.push(tipo_visita.toUpperCase());
      index++;
    }

    if (origen) {
      query += ` AND ot.origen = $${index}`;
      values.push(origen.toUpperCase());
      index++;
    }

    query += ` ORDER BY ot.fecha_servicio DESC, ot.id_orden_trabajo DESC`;

    const { rows } = await pool.query(query, values);
    return res.json(rows);
  } catch (error) {
    console.error("Error al listar órdenes:", error);
    return res.status(500).json({ error: "Error interno al listar órdenes" });
  }
};

export const obtenerOrdenTrabajoPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const ordenQuery = `
      SELECT
        ot.*,
        c.nombre_completo AS cliente,
        c.nombre_empresa,
        p.nombre_propiedad,
        p.direccion,
        p.referencia,
        cu.nombre AS cuadrilla
      FROM ordenes_trabajo ot
      INNER JOIN clientes c
        ON ot.id_cliente = c.id_cliente
      INNER JOIN propiedades p
        ON ot.id_propiedad = p.id_propiedad
      LEFT JOIN cuadrillas cu
        ON ot.id_cuadrilla = cu.id_cuadrilla
      WHERE ot.id_orden_trabajo = $1;
    `;

    const ordenResult = await pool.query(ordenQuery, [id]);

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    const detallesQuery = `
      SELECT
        d.*,
        s.nombre AS servicio,
        cs.nombre AS categoria_servicio
      FROM ordenes_trabajo_detalle d
      INNER JOIN servicios s
        ON d.id_servicio = s.id_servicio
      INNER JOIN categorias_servicio cs
        ON s.id_categoria_servicio = cs.id_categoria_servicio
      WHERE d.id_orden_trabajo = $1
      ORDER BY d.id_orden_detalle ASC;
    `;

    const detallesResult = await pool.query(detallesQuery, [id]);

    return res.json({
      ...ordenResult.rows[0],
      detalles: detallesResult.rows,
    });
  } catch (error) {
    console.error("Error al obtener orden:", error);
    return res.status(500).json({ error: "Error interno al obtener orden" });
  }
};

export const actualizarOrdenTrabajo = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const anteriorOrdenResult = await client.query(
  `SELECT * FROM ordenes_trabajo WHERE id_orden_trabajo = $1`,
  [id]
);

if (anteriorOrdenResult.rows.length === 0) {
  await client.query("ROLLBACK");
  return res.status(404).json({ error: "Orden no encontrada" });
}

const anteriorOrden = anteriorOrdenResult.rows[0];

    const { id } = req.params;
    const {
      id_cliente,
      id_propiedad,
      id_cuadrilla,
      fecha_servicio,
      tipo_visita,
      origen,
      hora_inicio_programada,
      hora_inicio_real,
      hora_fin_real,
      duracion_real_min,
      descuento,
      costo_estimado,
      observaciones_previas,
      observaciones_finales,
      confirmado_por_cliente,
      nombre_recibe,
      firma_cliente_url,
      detalles,
    } = req.body;

    if (!id_cliente) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El cliente es obligatorio" });
    }

    if (!id_propiedad) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "La propiedad es obligatoria" });
    }

    if (!fecha_servicio) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "La fecha de servicio es obligatoria" });
    }

    if (!Array.isArray(detalles) || detalles.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Debe enviar al menos un detalle de servicio" });
    }

    const existeOrden = await client.query(
      `SELECT id_orden_trabajo FROM ordenes_trabajo WHERE id_orden_trabajo = $1`,
      [id]
    );

    if (existeOrden.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    const tipoVisitaFinal = (tipo_visita || "PROGRAMADA").toUpperCase();
    if (!TIPOS_VISITA_VALIDOS.includes(tipoVisitaFinal)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Tipo de visita inválido" });
    }

    const origenFinal = (origen || "MANUAL").toUpperCase();
    if (!ORIGENES_VALIDOS.includes(origenFinal)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Origen inválido" });
    }

    const descuentoFinal = descuento === undefined || descuento === null ? 0 : Number(descuento);
    if (descuentoFinal < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El descuento no puede ser negativo" });
    }

    if (duracion_real_min !== undefined && duracion_real_min !== null && Number(duracion_real_min) < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "La duración real no puede ser negativa" });
    }

    if (costo_estimado !== undefined && costo_estimado !== null && Number(costo_estimado) < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El costo estimado no puede ser negativo" });
    }

    const clienteResult = await client.query(
      `SELECT id_cliente, estado FROM clientes WHERE id_cliente = $1`,
      [id_cliente]
    );

    if (clienteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "El cliente no existe" });
    }

    if (clienteResult.rows[0].estado !== "ACTIVO") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No se puede usar un cliente inactivo" });
    }

    const propiedadResult = await client.query(
      `SELECT id_propiedad, id_cliente, estado FROM propiedades WHERE id_propiedad = $1`,
      [id_propiedad]
    );

    if (propiedadResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "La propiedad no existe" });
    }

    if (propiedadResult.rows[0].estado !== "ACTIVA") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No se puede usar una propiedad inactiva" });
    }

    if (Number(propiedadResult.rows[0].id_cliente) !== Number(id_cliente)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "La propiedad no pertenece al cliente seleccionado" });
    }

    if (id_cuadrilla) {
      const cuadrillaResult = await client.query(
        `SELECT id_cuadrilla, estado FROM cuadrillas WHERE id_cuadrilla = $1`,
        [id_cuadrilla]
      );

      if (cuadrillaResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "La cuadrilla no existe" });
      }

      if (cuadrillaResult.rows[0].estado !== "ACTIVA") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "No se puede usar una cuadrilla inactiva" });
      }
    }

    await client.query(
      `
        UPDATE ordenes_trabajo
        SET id_cliente = $1,
            id_propiedad = $2,
            id_cuadrilla = $3,
            fecha_servicio = $4,
            tipo_visita = $5,
            origen = $6,
            hora_inicio_programada = $7,
            hora_inicio_real = $8,
            hora_fin_real = $9,
            duracion_real_min = $10,
            descuento = $11,
            costo_estimado = $12,
            observaciones_previas = $13,
            observaciones_finales = $14,
            confirmado_por_cliente = $15,
            nombre_recibe = $16,
            firma_cliente_url = $17,
            updated_by = $18,
            updated_at = NOW()
        WHERE id_orden_trabajo = $19
      `,
      [
        id_cliente,
        id_propiedad,
        id_cuadrilla || null,
        fecha_servicio,
        tipoVisitaFinal,
        origenFinal,
        hora_inicio_programada || null,
        hora_inicio_real || null,
        hora_fin_real || null,
        duracion_real_min ?? null,
        descuentoFinal,
        costo_estimado ?? null,
        observaciones_previas?.trim() || null,
        observaciones_finales?.trim() || null,
        confirmado_por_cliente ?? false,
        nombre_recibe?.trim() || null,
        firma_cliente_url?.trim() || null,
        id,
      ]
    );

    await client.query(
      `DELETE FROM ordenes_trabajo_detalle WHERE id_orden_trabajo = $1`,
      [id]
    );

    for (const detalle of detalles) {
      const {
        id_servicio,
        id_programacion,
        descripcion_servicio,
        cantidad,
        precio_unitario,
        descripcion_precio,
        duracion_estimada_min,
        duracion_real_min,
        estado,
        observaciones,
      } = detalle;

      if (!id_servicio) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Cada detalle debe incluir id_servicio" });
      }

      const cantidadFinal = Number(cantidad ?? 1);
      if (cantidadFinal <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "La cantidad debe ser mayor a 0" });
      }

      const precioUnitarioFinal = Number(precio_unitario ?? 0);
      if (precioUnitarioFinal < 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "El precio unitario no puede ser negativo" });
      }

      const estadoDetalleFinal = (estado || "PENDIENTE").toUpperCase();
      if (!ESTADOS_DETALLE_VALIDOS.includes(estadoDetalleFinal)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Estado de detalle inválido" });
      }

      const servicioResult = await client.query(
        `SELECT id_servicio, estado FROM servicios WHERE id_servicio = $1`,
        [id_servicio]
      );

      if (servicioResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: `El servicio ${id_servicio} no existe` });
      }

      if (servicioResult.rows[0].estado !== "ACTIVO") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `El servicio ${id_servicio} está inactivo` });
      }

      if (id_programacion) {
        const programacionResult = await client.query(
          `
            SELECT id_programacion, id_cliente, id_propiedad, id_servicio
            FROM programaciones_servicio
            WHERE id_programacion = $1
          `,
          [id_programacion]
        );

        if (programacionResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: `La programación ${id_programacion} no existe` });
        }

        const prog = programacionResult.rows[0];

        if (Number(prog.id_cliente) !== Number(id_cliente)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: `La programación ${id_programacion} no pertenece al cliente seleccionado`,
          });
        }

        if (Number(prog.id_propiedad) !== Number(id_propiedad)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: `La programación ${id_programacion} no pertenece a la propiedad seleccionada`,
          });
        }

        if (Number(prog.id_servicio) !== Number(id_servicio)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: `La programación ${id_programacion} no corresponde al servicio seleccionado`,
          });
        }
      }

      const subtotal = Number((cantidadFinal * precioUnitarioFinal).toFixed(2));

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
            duracion_real_min,
            estado,
            observaciones
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `,
        [
          id,
          id_servicio,
          id_programacion || null,
          descripcion_servicio?.trim() || null,
          cantidadFinal,
          precioUnitarioFinal,
          descripcion_precio?.trim() || null,
          subtotal,
          duracion_estimada_min ?? null,
          duracion_real_min ?? null,
          estadoDetalleFinal,
          observaciones?.trim() || null,
        ]
      );
    }

    const ordenFinal = await recalcularTotalesOrden(client, id, descuentoFinal);

   await registrarAuditoria({
  client,
  tabla_afectada: "ordenes_trabajo",
  id_registro: Number(id),
  accion: "ACTUALIZAR",
  descripcion: `Se actualizó la orden ${ordenFinal.numero_orden}`,
  valores_anteriores: anteriorOrden,
  valores_nuevos: ordenFinal,
  realizado_por: req.user?.id_usuario || null,
});

    await client.query("COMMIT");

    return res.json(ordenFinal);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al actualizar orden:", error);
    return res.status(500).json({ error: "Error interno al actualizar orden" });
  } finally {
    client.release();
  }
};

export const cambiarEstadoOrdenTrabajo = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, motivo_cancelacion } = req.body;

    if (!estado || !ESTADOS_ORDEN_VALIDOS.includes(estado.toUpperCase())) {
      return res.status(400).json({ error: "Estado inválido" });
    }

    if (estado.toUpperCase() === "CANCELADA" && (!motivo_cancelacion || !motivo_cancelacion.trim())) {
      return res.status(400).json({
        error: "Debe enviar motivo de cancelación al cancelar la orden",
      });
    }
const anteriorResult = await pool.query(
  `SELECT * FROM ordenes_trabajo WHERE id_orden_trabajo = $1`,
  [id]
);

if (anteriorResult.rows.length === 0) {
  return res.status(404).json({ error: "Orden no encontrada" });
}

const anterior = anteriorResult.rows[0];

  const esCancelacion = estado.toUpperCase() === "CANCELADA";

const query = `
  UPDATE ordenes_trabajo
  SET estado = $1,
      motivo_cancelacion = $2,
      updated_by = $3,
      updated_at = NOW(),
      cancelado_por = CASE WHEN $1 = 'CANCELADA' THEN $3 ELSE cancelado_por END,
      cancelado_en = CASE WHEN $1 = 'CANCELADA' THEN NOW() ELSE cancelado_en END
  WHERE id_orden_trabajo = $4
  RETURNING *;
`;

const { rows } = await pool.query(query, [
  estado.toUpperCase(),
  motivo_cancelacion?.trim() || null,
  req.user?.id_usuario || null,
  id,
]);
const orden = rows[0];

await registrarAuditoria({
  tabla_afectada: "ordenes_trabajo",
  id_registro: orden.id_orden_trabajo,
  accion: esCancelacion ? "CANCELAR" : "CAMBIAR_ESTADO",
  descripcion: esCancelacion
    ? `Se canceló la orden ${orden.numero_orden}`
    : `Se cambió el estado de la orden ${orden.numero_orden} a ${orden.estado}`,
  valores_anteriores: anterior,
  valores_nuevos: orden,
  realizado_por: req.user?.id_usuario || null,
});

    if (rows.length === 0) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al cambiar estado de orden:", error);
    return res.status(500).json({ error: "Error interno al cambiar estado de orden" });
  }
};