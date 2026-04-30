/**
 * Cotizaciones (Estimados).
 *
 * Workflow:
 *   BORRADOR ──> ENVIADA ──> APROBADA ──> CONVERTIDA  (orden generada)
 *      │            │            │
 *      │            │            └──> RECHAZADA
 *      │            └──> VENCIDA  (auto si pasó vigencia_hasta)
 *      └──> editable solo en BORRADOR
 *
 * Reglas de negocio:
 *  - El número se genera con FOR UPDATE para evitar colisiones concurrentes
 *    (mismo patrón que arreglamos en S1 para abonos).
 *  - Sólo se puede CONVERTIR una cotización APROBADA. La conversión crea
 *    una orden nueva en estado PENDIENTE/PROGRAMADA y marca la cotización
 *    como CONVERTIDA. Toda la operación es transaccional.
 *  - El rol COBRADOR NO puede crear/editar/convertir cotizaciones —
 *    eso queda en routes con requireRole.
 */
import { pool } from "../config/db.js";
import { registrarAuditoria } from "../utils/auditoria.js";
import { hasPublicColumn } from "../utils/schema.js";

const ESTADOS_VALIDOS = [
  "BORRADOR",
  "ENVIADA",
  "APROBADA",
  "RECHAZADA",
  "VENCIDA",
  "CONVERTIDA",
];

const ESTADO_COTIZACION_ALIASES = {
  PENDIENTE: "BORRADOR",
};

// Transiciones permitidas: from → [to válidos]
const TRANSICIONES = {
  BORRADOR: ["ENVIADA", "RECHAZADA"],
  ENVIADA: ["APROBADA", "RECHAZADA", "VENCIDA"],
  APROBADA: ["CONVERTIDA", "RECHAZADA"],
  RECHAZADA: [],
  VENCIDA: [],
  CONVERTIDA: [],
};

const normalizarEstadoCotizacion = (estado) =>
  ESTADO_COTIZACION_ALIASES[String(estado || "").toUpperCase()] ||
  String(estado || "").toUpperCase();

const getCotizacionSchemaSupport = async () => {
  const [soportaUpdatedBy, soportaCanceladoPor, soportaCanceladoEn] = await Promise.all([
    hasPublicColumn("cotizaciones", "updated_by"),
    hasPublicColumn("cotizaciones", "cancelado_por"),
    hasPublicColumn("cotizaciones", "cancelado_en"),
  ]);

  return { soportaUpdatedBy, soportaCanceladoPor, soportaCanceladoEn };
};

const normalizarIdsEmpleados = (id_empleados = []) => {
  if (id_empleados === undefined || id_empleados === null) {
    return [];
  }

  if (!Array.isArray(id_empleados)) {
    return null;
  }

  const ids = [...new Set(id_empleados.map((id) => Number(id)).filter(Boolean))];
  return ids.every((id) => Number.isInteger(id) && id > 0) ? ids : null;
};

const validarEmpleadosOrden = async (client, idsEmpleados, id_cuadrilla) => {
  for (const id_empleado of idsEmpleados) {
    const empleadoResult = await client.query(
      `SELECT id_empleado, id_cuadrilla, estado FROM empleados WHERE id_empleado = $1`,
      [id_empleado]
    );

    if (empleadoResult.rows.length === 0) {
      return { ok: false, status: 404, error: `El tecnico ${id_empleado} no existe` };
    }

    const empleado = empleadoResult.rows[0];

    if (empleado.estado !== "ACTIVO") {
      return { ok: false, status: 400, error: `El tecnico ${id_empleado} esta inactivo` };
    }

    if (
      id_cuadrilla &&
      empleado.id_cuadrilla &&
      Number(empleado.id_cuadrilla) !== Number(id_cuadrilla)
    ) {
      return {
        ok: false,
        status: 400,
        error: `El tecnico ${id_empleado} no pertenece a la cuadrilla seleccionada`,
      };
    }
  }

  return { ok: true };
};

const sincronizarEmpleadosOrden = async (client, id_orden_trabajo, idsEmpleados) => {
  if (idsEmpleados.length === 0) {
    return;
  }

  for (const id_empleado of idsEmpleados) {
    await client.query(
      `INSERT INTO ordenes_empleados (id_orden_trabajo, id_empleado) VALUES ($1, $2)`,
      [id_orden_trabajo, id_empleado]
    );
  }
};

const validarDisponibilidadEmpleadosOrden = async (client, idsEmpleados, fecha_servicio) => {
  for (const id_empleado of idsEmpleados) {
    const conflictoResult = await client.query(
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
      [id_empleado, fecha_servicio]
    );

    if (conflictoResult.rows.length > 0) {
      return {
        ok: false,
        status: 409,
        error: `El tecnico ${id_empleado} ya tiene asignada la orden ${conflictoResult.rows[0].numero_orden} para la fecha ${fecha_servicio}`,
      };
    }
  }

  return { ok: true };
};

/**
 * Genera el siguiente número correlativo global de cotización.
 * Formato: COT-YYYYMMDD-NNNNN  (5 dígitos)
 *
 * Usa FOR UPDATE sobre la fila MAX para serializar las inserciones
 * concurrentes y evitar que dos cotizaciones distintas tomen el mismo
 * número (constraint UNIQUE las haría fallar).
 *
 * @param {pg.PoolClient} client - cliente dentro de una transacción.
 */
const generarNumeroCotizacion = async (client) => {
  // Lock advisory + count: lockeamos un identificador arbitrario (1234)
  // mientras se genera la numeración. Más simple que SELECT FOR UPDATE
  // sobre una tabla específica y funciona en cualquier contexto.
  await client.query("SELECT pg_advisory_xact_lock(742398)");

  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS total FROM cotizaciones`
  );
  const siguiente = rows[0].total + 1;

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");

  return `COT-${y}${m}${d}-${String(siguiente).padStart(5, "0")}`;
};

// ============================================================================
// CREAR — siempre arranca en BORRADOR
// ============================================================================
export const crearCotizacion = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      id_cliente,
      id_propiedad,
      vigencia_hasta,
      descuento,
      observaciones,
      detalles,
    } = req.body;

    if (!id_cliente) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El cliente es obligatorio" });
    }

    if (!Array.isArray(detalles) || detalles.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Debe enviar al menos un detalle de cotización" });
    }

    const descuentoFinal =
      descuento === undefined || descuento === null ? 0 : Number(descuento);
    if (descuentoFinal < 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "El descuento no puede ser negativo" });
    }

    // Validar cliente
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
      return res
        .status(400)
        .json({ error: "No se puede cotizar a un cliente inactivo" });
    }

    // Validar propiedad si se envió
    if (id_propiedad) {
      const propResult = await client.query(
        `SELECT id_propiedad, id_cliente, estado FROM propiedades WHERE id_propiedad = $1`,
        [id_propiedad]
      );
      if (propResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "La propiedad no existe" });
      }
      if (propResult.rows[0].estado !== "ACTIVA") {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "No se puede usar una propiedad inactiva" });
      }
      if (Number(propResult.rows[0].id_cliente) !== Number(id_cliente)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "La propiedad no pertenece al cliente seleccionado",
        });
      }
    }

    // Validar y calcular detalles
    let subtotalAcum = 0;
    const detallesNorm = [];

    for (const det of detalles) {
      const {
        id_servicio,
        descripcion,
        cantidad,
        precio_unitario,
        descripcion_precio,
      } = det;

      if (!descripcion || !descripcion.trim()) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Cada detalle debe tener descripción" });
      }

      const cantidadFinal = Number(cantidad ?? 1);
      if (cantidadFinal <= 0) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "La cantidad debe ser mayor a 0" });
      }

      const precioFinal = Number(precio_unitario ?? 0);
      if (precioFinal < 0) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "El precio unitario no puede ser negativo" });
      }

      // Validar servicio si se envió
      if (id_servicio) {
        const servResult = await client.query(
          `SELECT id_servicio, estado FROM servicios WHERE id_servicio = $1`,
          [id_servicio]
        );
        if (servResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res
            .status(404)
            .json({ error: `El servicio ${id_servicio} no existe` });
        }
        if (servResult.rows[0].estado !== "ACTIVO") {
          await client.query("ROLLBACK");
          return res
            .status(400)
            .json({ error: `El servicio ${id_servicio} está inactivo` });
        }
      }

      const subtotal = Number((cantidadFinal * precioFinal).toFixed(2));
      subtotalAcum += subtotal;

      detallesNorm.push({
        id_servicio: id_servicio || null,
        descripcion: descripcion.trim(),
        cantidad: cantidadFinal,
        precio_unitario: precioFinal,
        subtotal,
        descripcion_precio: descripcion_precio?.trim() || null,
      });
    }

    const total = Math.max(0, subtotalAcum - descuentoFinal);
    const numero = await generarNumeroCotizacion(client);
    const userId = req.user?.id_usuario || null;

    // INSERT cabecera
    const cotResult = await client.query(
      `
        INSERT INTO cotizaciones (
          numero_cotizacion, id_cliente, id_propiedad,
          vigencia_hasta, subtotal, descuento, total,
          estado, observaciones, created_by, updated_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,'BORRADOR',$8,$9,$9)
        RETURNING *
      `,
      [
        numero,
        id_cliente,
        id_propiedad || null,
        vigencia_hasta || null,
        subtotalAcum,
        descuentoFinal,
        total,
        observaciones?.trim() || null,
        userId,
      ]
    );
    const cotizacion = cotResult.rows[0];

    // INSERT detalles
    for (const d of detallesNorm) {
      await client.query(
        `
          INSERT INTO cotizaciones_detalle (
            id_cotizacion, id_servicio, descripcion,
            cantidad, precio_unitario, subtotal,
            descripcion_precio, created_by, updated_by
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
        `,
        [
          cotizacion.id_cotizacion,
          d.id_servicio,
          d.descripcion,
          d.cantidad,
          d.precio_unitario,
          d.subtotal,
          d.descripcion_precio,
          userId,
        ]
      );
    }

    await registrarAuditoria({
      client,
      tabla_afectada: "cotizaciones",
      id_registro: cotizacion.id_cotizacion,
      accion: "CREAR",
      descripcion: `Se creó la cotización ${cotizacion.numero_cotizacion}`,
      valores_nuevos: cotizacion,
      realizado_por: userId,
    });

    await client.query("COMMIT");
    return res.status(201).json(cotizacion);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al crear cotización:", error);
    return res.status(500).json({ error: "Error interno al crear cotización" });
  } finally {
    client.release();
  }
};

// ============================================================================
// LISTAR
// ============================================================================
export const listarCotizaciones = async (req, res) => {
  try {
    const { estado, id_cliente, id_propiedad, fecha_desde, fecha_hasta } =
      req.query;
    const { page, limit, offset } = req.pagination || {
      page: 1,
      limit: 50,
      offset: 0,
    };

    let whereClause = " WHERE 1=1 ";
    const values = [];
    let index = 1;

    if (estado) {
      const estadoUpper = normalizarEstadoCotizacion(estado);
      if (!ESTADOS_VALIDOS.includes(estadoUpper)) {
        return res.status(400).json({ error: "Estado inválido" });
      }
      whereClause += ` AND co.estado = $${index}`;
      values.push(estadoUpper);
      index++;
    }
    if (id_cliente) {
      whereClause += ` AND co.id_cliente = $${index}`;
      values.push(id_cliente);
      index++;
    }
    if (id_propiedad) {
      whereClause += ` AND co.id_propiedad = $${index}`;
      values.push(id_propiedad);
      index++;
    }
    if (fecha_desde) {
      whereClause += ` AND co.fecha_cotizacion >= $${index}`;
      values.push(fecha_desde);
      index++;
    }
    if (fecha_hasta) {
      whereClause += ` AND co.fecha_cotizacion <= $${index}`;
      values.push(fecha_hasta);
      index++;
    }

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS total
        FROM cotizaciones co
        INNER JOIN clientes c ON co.id_cliente = c.id_cliente
        LEFT JOIN propiedades p ON co.id_propiedad = p.id_propiedad
        ${whereClause}
      `,
      values
    );
    const total = countResult.rows[0].total;

    const dataQuery = `
      SELECT
        co.*,
        c.nombre_completo AS cliente,
        c.nombre_empresa AS empresa,
        p.nombre_propiedad
      FROM cotizaciones co
      INNER JOIN clientes c ON co.id_cliente = c.id_cliente
      LEFT JOIN propiedades p ON co.id_propiedad = p.id_propiedad
      ${whereClause}
      ORDER BY co.fecha_cotizacion DESC, co.id_cotizacion DESC
      LIMIT $${index} OFFSET $${index + 1}
    `;

    const { rows } = await pool.query(dataQuery, [...values, limit, offset]);

    return res.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error al listar cotizaciones:", error);
    return res
      .status(500)
      .json({ error: "Error interno al listar cotizaciones" });
  }
};

// ============================================================================
// OBTENER POR ID — incluye detalles
// ============================================================================
export const obtenerCotizacionPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const cotResult = await pool.query(
      `
        SELECT
          co.*,
          c.nombre_completo AS cliente,
          c.nombre_empresa AS empresa,
          c.idioma_preferido,
          p.nombre_propiedad,
          p.direccion AS propiedad_direccion
        FROM cotizaciones co
        INNER JOIN clientes c ON co.id_cliente = c.id_cliente
        LEFT JOIN propiedades p ON co.id_propiedad = p.id_propiedad
        WHERE co.id_cotizacion = $1
      `,
      [id]
    );

    if (cotResult.rows.length === 0) {
      return res.status(404).json({ error: "Cotización no encontrada" });
    }

    const detallesResult = await pool.query(
      `
        SELECT cd.*, s.nombre AS servicio
        FROM cotizaciones_detalle cd
        LEFT JOIN servicios s ON cd.id_servicio = s.id_servicio
        WHERE cd.id_cotizacion = $1
        ORDER BY cd.id_cotizacion_detalle
      `,
      [id]
    );

    return res.json({
      ...cotResult.rows[0],
      detalles: detallesResult.rows,
    });
  } catch (error) {
    console.error("Error al obtener cotización:", error);
    return res
      .status(500)
      .json({ error: "Error interno al obtener cotización" });
  }
};

// ============================================================================
// ACTUALIZAR — sólo si está en BORRADOR
// ============================================================================
export const actualizarCotizacion = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const {
      id_cliente,
      id_propiedad,
      vigencia_hasta,
      descuento,
      observaciones,
      detalles,
    } = req.body;

    const anteriorResult = await client.query(
      `SELECT * FROM cotizaciones WHERE id_cotizacion = $1 FOR UPDATE`,
      [id]
    );
    if (anteriorResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cotización no encontrada" });
    }
    const anterior = anteriorResult.rows[0];

    if (anterior.estado !== "BORRADOR") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Solo se puede editar una cotizacion en PENDIENTE (estado actual: ${anterior.estado})`,
      });
    }

    if (!Array.isArray(detalles) || detalles.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Debe enviar al menos un detalle" });
    }

    const descuentoFinal =
      descuento === undefined || descuento === null ? 0 : Number(descuento);
    if (descuentoFinal < 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "El descuento no puede ser negativo" });
    }

    // Si cambian cliente, valida coherencia
    if (id_cliente) {
      const cliResult = await client.query(
        `SELECT id_cliente, estado FROM clientes WHERE id_cliente = $1`,
        [id_cliente]
      );
      if (cliResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "El cliente no existe" });
      }
      if (cliResult.rows[0].estado !== "ACTIVO") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Cliente inactivo" });
      }
    }

    if (id_propiedad) {
      const propResult = await client.query(
        `SELECT id_propiedad, id_cliente, estado FROM propiedades WHERE id_propiedad = $1`,
        [id_propiedad]
      );
      if (propResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Propiedad no existe" });
      }
      if (propResult.rows[0].estado !== "ACTIVA") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Propiedad inactiva" });
      }
      const idClienteFinal = id_cliente ?? anterior.id_cliente;
      if (Number(propResult.rows[0].id_cliente) !== Number(idClienteFinal)) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "La propiedad no pertenece al cliente" });
      }
    }

    // Calcular subtotal de detalles
    let subtotalAcum = 0;
    const detallesNorm = [];
    for (const det of detalles) {
      const {
        id_servicio,
        descripcion,
        cantidad,
        precio_unitario,
        descripcion_precio,
      } = det;

      if (!descripcion || !descripcion.trim()) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Cada detalle debe tener descripción" });
      }
      const cantidadFinal = Number(cantidad ?? 1);
      if (cantidadFinal <= 0) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Cantidad debe ser mayor a 0" });
      }
      const precioFinal = Number(precio_unitario ?? 0);
      if (precioFinal < 0) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Precio unitario no puede ser negativo" });
      }

      const subtotal = Number((cantidadFinal * precioFinal).toFixed(2));
      subtotalAcum += subtotal;
      detallesNorm.push({
        id_servicio: id_servicio || null,
        descripcion: descripcion.trim(),
        cantidad: cantidadFinal,
        precio_unitario: precioFinal,
        subtotal,
        descripcion_precio: descripcion_precio?.trim() || null,
      });
    }

    const total = Math.max(0, subtotalAcum - descuentoFinal);
    const userId = req.user?.id_usuario || null;

    const updateResult = await client.query(
      `
        UPDATE cotizaciones
        SET id_cliente = COALESCE($1, id_cliente),
            id_propiedad = $2,
            vigencia_hasta = $3,
            subtotal = $4,
            descuento = $5,
            total = $6,
            observaciones = $7,
            updated_by = $8,
            updated_at = NOW()
        WHERE id_cotizacion = $9
        RETURNING *
      `,
      [
        id_cliente || null,
        id_propiedad || null,
        vigencia_hasta || null,
        subtotalAcum,
        descuentoFinal,
        total,
        observaciones?.trim() || null,
        userId,
        id,
      ]
    );
    const cotizacion = updateResult.rows[0];

    // Reemplazar detalles
    await client.query(
      `DELETE FROM cotizaciones_detalle WHERE id_cotizacion = $1`,
      [id]
    );
    for (const d of detallesNorm) {
      await client.query(
        `
          INSERT INTO cotizaciones_detalle (
            id_cotizacion, id_servicio, descripcion,
            cantidad, precio_unitario, subtotal,
            descripcion_precio, created_by, updated_by
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
        `,
        [
          id,
          d.id_servicio,
          d.descripcion,
          d.cantidad,
          d.precio_unitario,
          d.subtotal,
          d.descripcion_precio,
          userId,
        ]
      );
    }

    await registrarAuditoria({
      client,
      tabla_afectada: "cotizaciones",
      id_registro: cotizacion.id_cotizacion,
      accion: "ACTUALIZAR",
      descripcion: `Se actualizó la cotización ${cotizacion.numero_cotizacion}`,
      valores_anteriores: anterior,
      valores_nuevos: cotizacion,
      realizado_por: userId,
    });

    await client.query("COMMIT");
    return res.json(cotizacion);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al actualizar cotización:", error);
    return res
      .status(500)
      .json({ error: "Error interno al actualizar cotización" });
  } finally {
    client.release();
  }
};

// ============================================================================
// CAMBIAR ESTADO — valida transiciones permitidas
// ============================================================================
export const cambiarEstadoCotizacion = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const { estado } = req.body;

    const estadoNuevo = normalizarEstadoCotizacion(estado);

    if (!estadoNuevo || !ESTADOS_VALIDOS.includes(estadoNuevo)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Estado inv\u00e1lido" });
    }

    // CONVERTIDA solo se setea desde el endpoint de conversión.
    if (estadoNuevo === "CONVERTIDA") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Para convertir usá POST /api/cotizaciones/:id/convertir",
      });
    }

    const anteriorResult = await client.query(
      `SELECT * FROM cotizaciones WHERE id_cotizacion = $1 FOR UPDATE`,
      [id]
    );
    if (anteriorResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cotización no encontrada" });
    }
    const anterior = anteriorResult.rows[0];

    if (anterior.estado === estadoNuevo) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `La cotización ya está en estado ${estadoNuevo}`,
      });
    }

    const transicionesPermitidas = TRANSICIONES[anterior.estado] || [];
    if (!transicionesPermitidas.includes(estadoNuevo)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `No se puede pasar de ${anterior.estado} a ${estadoNuevo}`,
      });
    }

    const userId = req.user?.id_usuario || null;
    const esRechazo = estadoNuevo === "RECHAZADA";
    const schema = await getCotizacionSchemaSupport();

    const sets = ["estado = $1", "updated_at = NOW()"];
    const values = [estadoNuevo];

    if (schema.soportaUpdatedBy) {
      values.push(userId);
      sets.push(`updated_by = $${values.length}`);
    }

    if (schema.soportaCanceladoPor) {
      values.push(userId);
      sets.push(`cancelado_por = CASE WHEN $1 IN ('RECHAZADA','VENCIDA') THEN $${values.length} ELSE cancelado_por END`);
    }

    if (schema.soportaCanceladoEn) {
      sets.push(`cancelado_en = CASE WHEN $1 IN ('RECHAZADA','VENCIDA') THEN NOW() ELSE cancelado_en END`);
    }

    values.push(id);

    const { rows } = await client.query(
      `
        UPDATE cotizaciones
        SET ${sets.join(", ")}
        WHERE id_cotizacion = ${values.length}
        RETURNING *
      `,
      values
    );
    const cotizacion = rows[0];

    await registrarAuditoria({
      client,
      tabla_afectada: "cotizaciones",
      id_registro: cotizacion.id_cotizacion,
      accion: esRechazo ? "CANCELAR" : "CAMBIAR_ESTADO",
      descripcion: esRechazo
        ? `Se rechazó la cotización ${cotizacion.numero_cotizacion}`
        : `Se cambió el estado de la cotización ${cotizacion.numero_cotizacion} a ${cotizacion.estado}`,
      valores_anteriores: anterior,
      valores_nuevos: cotizacion,
      realizado_por: userId,
    });

    await client.query("COMMIT");
    return res.json(cotizacion);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al cambiar estado de cotización:", error);
    return res
      .status(500)
      .json({ error: "Error interno al cambiar estado" });
  } finally {
    client.release();
  }
};

// ============================================================================
// CONVERTIR A ORDEN — la transición clave (APROBADA → CONVERTIDA + nueva orden)
// ============================================================================
export const convertirCotizacionAOrden = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const { fecha_servicio, id_cuadrilla, id_empleados, observaciones_previas } = req.body;

    if (!fecha_servicio) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "fecha_servicio es obligatoria para crear la orden" });
    }

    const idsEmpleados = normalizarIdsEmpleados(id_empleados);
    if (idsEmpleados === null) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "id_empleados debe ser un arreglo de IDs validos" });
    }

    // Lock de la cotización
    const cotResult = await client.query(
      `SELECT * FROM cotizaciones WHERE id_cotizacion = $1 FOR UPDATE`,
      [id]
    );
    if (cotResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Cotización no encontrada" });
    }
    const cotizacion = cotResult.rows[0];

    if (cotizacion.estado !== "APROBADA") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Sólo se puede convertir una cotización APROBADA (actual: ${cotizacion.estado})`,
      });
    }

    if (!cotizacion.id_propiedad) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error:
          "La cotización no tiene propiedad asignada — no se puede generar orden",
      });
    }

    // Validar cuadrilla si vino
    if (id_cuadrilla) {
      const cuadResult = await client.query(
        `SELECT id_cuadrilla, estado FROM cuadrillas WHERE id_cuadrilla = $1`,
        [id_cuadrilla]
      );
      if (cuadResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Cuadrilla no existe" });
      }
      if (cuadResult.rows[0].estado !== "ACTIVA") {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Cuadrilla inactiva" });
      }
    }

    const empleadosValidacion = await validarEmpleadosOrden(client, idsEmpleados, id_cuadrilla);
    if (!empleadosValidacion.ok) {
      await client.query("ROLLBACK");
      return res.status(empleadosValidacion.status).json({ error: empleadosValidacion.error });
    }

    const disponibilidadEmpleados = await validarDisponibilidadEmpleadosOrden(
      client,
      idsEmpleados,
      fecha_servicio
    );
    if (!disponibilidadEmpleados.ok) {
      await client.query("ROLLBACK");
      return res.status(disponibilidadEmpleados.status).json({ error: disponibilidadEmpleados.error });
    }

    // Cargar detalles de la cotización
    const detallesResult = await client.query(
      `
        SELECT cd.*, s.estado AS servicio_estado
        FROM cotizaciones_detalle cd
        LEFT JOIN servicios s ON cd.id_servicio = s.id_servicio
        WHERE cd.id_cotizacion = $1
        ORDER BY cd.id_cotizacion_detalle
      `,
      [id]
    );

    // Para crear orden, todo detalle DEBE tener id_servicio activo.
    // Las descripciones libres no pueden mapearse 1:1 a servicios.
    for (const d of detallesResult.rows) {
      if (!d.id_servicio) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `El detalle "${d.descripcion}" no tiene id_servicio — no se puede convertir a orden. Edita la cotización para asignar servicios reales.`,
        });
      }
      if (d.servicio_estado !== "ACTIVO") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `El servicio del detalle "${d.descripcion}" está inactivo`,
        });
      }
    }

    // Generar número de orden (mismo patrón timestamp que el módulo de
    // órdenes — mantener coherencia visual entre OT-... y COT-...).
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const h = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    const numero_orden = `OT-${y}${m}${d}-${h}${mi}${s}`;

    const userId = req.user?.id_usuario || null;

    // INSERT orden con totales heredados de la cotización
    const ordenResult = await client.query(
      `
        INSERT INTO ordenes_trabajo (
          numero_orden, id_cliente, id_propiedad, id_cuadrilla,
          fecha_servicio, tipo_visita, origen,
          descuento, subtotal, total_orden,
          observaciones_previas,
          created_by, updated_by
        )
        VALUES ($1,$2,$3,$4,$5,'PROGRAMADA','COTIZACION',$6,$7,$8,$9,$10,$10)
        RETURNING *
      `,
      [
        numero_orden,
        cotizacion.id_cliente,
        cotizacion.id_propiedad,
        id_cuadrilla || null,
        fecha_servicio,
        cotizacion.descuento,
        cotizacion.subtotal,
        cotizacion.total,
        observaciones_previas?.trim() || cotizacion.observaciones || null,
        userId,
      ]
    );
    const orden = ordenResult.rows[0];

    // INSERT detalles de la orden a partir de los de la cotización
    for (const d of detallesResult.rows) {
      await client.query(
        `
          INSERT INTO ordenes_trabajo_detalle (
            id_orden_trabajo, id_servicio, descripcion_servicio,
            cantidad, precio_unitario, subtotal, descripcion_precio,
            estado
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDIENTE')
        `,
        [
          orden.id_orden_trabajo,
          d.id_servicio,
          d.descripcion,
          d.cantidad,
          d.precio_unitario,
          d.subtotal,
          d.descripcion_precio,
        ]
      );
    }

    await sincronizarEmpleadosOrden(client, orden.id_orden_trabajo, idsEmpleados);

    // Marcar cotización como CONVERTIDA
    const cotizacionActualizadaResult = await client.query(
      `
        UPDATE cotizaciones
        SET estado = 'CONVERTIDA',
            updated_by = $1,
            updated_at = NOW()
        WHERE id_cotizacion = $2
        RETURNING *
      `,
      [userId, id]
    );
    const cotizacionActualizada = cotizacionActualizadaResult.rows[0];

    // Auditoría dual
    await registrarAuditoria({
      client,
      tabla_afectada: "cotizaciones",
      id_registro: cotizacion.id_cotizacion,
      accion: "CONVERTIR",
      descripcion: `Se convirtió la cotización ${cotizacion.numero_cotizacion} en orden ${orden.numero_orden}`,
      valores_anteriores: cotizacion,
      valores_nuevos: cotizacionActualizada,
      realizado_por: userId,
    });
    await registrarAuditoria({
      client,
      tabla_afectada: "ordenes_trabajo",
      id_registro: orden.id_orden_trabajo,
      accion: "CREAR",
      descripcion: `Se creó la orden ${orden.numero_orden} desde la cotización ${cotizacion.numero_cotizacion}`,
      valores_nuevos: orden,
      realizado_por: userId,
    });

    await client.query("COMMIT");
    return res.status(201).json({
      cotizacion: cotizacionActualizada,
      orden,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al convertir cotización:", error);
    return res
      .status(500)
      .json({ error: "Error interno al convertir cotización" });
  } finally {
    client.release();
  }
};

