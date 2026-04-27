-- =============================================================================
-- 0002_indices_recomendados.sql
-- Índices adicionales para queries frecuentes detectadas en los controllers.
-- Todos usan IF NOT EXISTS para ser idempotentes y CONCURRENTLY-friendly.
--
-- Criterio: cualquier columna usada en WHERE, ORDER BY o JOIN cuyos
-- valores tengan baja cardinalidad relativa al volumen estimado.
-- =============================================================================

-- ─── usuarios ────────────────────────────────────────────────────────────────
-- listarUsuarios filtra por estado y rol; authRequired hace SELECT por id.
CREATE INDEX IF NOT EXISTS idx_usuarios_estado    ON public.usuarios (estado);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol       ON public.usuarios (rol);

-- ─── clientes ────────────────────────────────────────────────────────────────
-- listarClientes filtra por estado y tipo_cliente; ORDER BY id_cliente DESC.
CREATE INDEX IF NOT EXISTS idx_clientes_estado       ON public.clientes (estado);
CREATE INDEX IF NOT EXISTS idx_clientes_tipo_cliente ON public.clientes (tipo_cliente);

-- ─── propiedades ─────────────────────────────────────────────────────────────
-- listarPropiedades filtra por estado y tipo_propiedad además de id_cliente.
CREATE INDEX IF NOT EXISTS idx_propiedades_estado         ON public.propiedades (estado);
CREATE INDEX IF NOT EXISTS idx_propiedades_tipo_propiedad ON public.propiedades (tipo_propiedad);

-- ─── catálogo de servicios ───────────────────────────────────────────────────
-- listarCategorias y listarServicios filtran por estado.
CREATE INDEX IF NOT EXISTS idx_categorias_servicio_estado ON public.categorias_servicio (estado);
CREATE INDEX IF NOT EXISTS idx_servicios_estado           ON public.servicios (estado);

-- ─── ordenes_trabajo ────────────────────────────────────────────────────────
-- listarOrdenesTrabajo filtra por id_cuadrilla, tipo_visita, origen.
CREATE INDEX IF NOT EXISTS idx_ordenes_id_cuadrilla ON public.ordenes_trabajo (id_cuadrilla);
CREATE INDEX IF NOT EXISTS idx_ordenes_tipo_visita  ON public.ordenes_trabajo (tipo_visita);
CREATE INDEX IF NOT EXISTS idx_ordenes_origen       ON public.ordenes_trabajo (origen);

-- ─── pagos ───────────────────────────────────────────────────────────────────
-- listarPagos filtra por metodo_pago y fecha_pago; ORDER BY fecha_pago DESC.
CREATE INDEX IF NOT EXISTS idx_pagos_metodo_pago ON public.pagos (metodo_pago);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha_pago  ON public.pagos (fecha_pago);

-- ─── creditos ────────────────────────────────────────────────────────────────
-- aplicarPagoACredito hace SELECT por id_orden_trabajo en algunos flujos.
CREATE INDEX IF NOT EXISTS idx_creditos_id_orden_trabajo ON public.creditos (id_orden_trabajo);

-- ─── pagos_credito ───────────────────────────────────────────────────────────
-- obtenerCreditoPorId carga pagos_credito por id_credito.
CREATE INDEX IF NOT EXISTS idx_pagos_credito_id_credito ON public.pagos_credito (id_credito);
CREATE INDEX IF NOT EXISTS idx_pagos_credito_id_pago    ON public.pagos_credito (id_pago);

-- ─── programaciones_servicio ────────────────────────────────────────────────
-- listarProgramaciones filtra por frecuencia y prioridad además de estado.
CREATE INDEX IF NOT EXISTS idx_programaciones_frecuencia ON public.programaciones_servicio (frecuencia);
CREATE INDEX IF NOT EXISTS idx_programaciones_prioridad  ON public.programaciones_servicio (prioridad);

-- ─── auditoria_eventos ──────────────────────────────────────────────────────
-- obtenerHistorialRegistro hace WHERE tabla_afectada = ? AND id_registro = ?.
-- Un índice compuesto es muchísimo más eficiente que dos índices separados.
CREATE INDEX IF NOT EXISTS idx_auditoria_tabla_registro
  ON public.auditoria_eventos (tabla_afectada, id_registro);
