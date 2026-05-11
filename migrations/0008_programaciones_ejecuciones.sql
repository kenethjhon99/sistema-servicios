CREATE TABLE IF NOT EXISTS public.programaciones_ejecuciones (
  id_ejecucion BIGSERIAL PRIMARY KEY,
  id_programacion BIGINT NOT NULL REFERENCES public.programaciones_servicio(id_programacion) ON DELETE CASCADE,
  fecha_programada DATE NOT NULL,
  fecha_reprogramada DATE NULL,
  hora_programada TIME NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  motivo_reprogramacion TEXT NULL,
  motivo_cancelacion TEXT NULL,
  id_orden_trabajo BIGINT NULL REFERENCES public.ordenes_trabajo(id_orden_trabajo) ON DELETE SET NULL,
  fecha_generacion_orden TIMESTAMP NULL,
  fecha_cierre TIMESTAMP NULL,
  resultado VARCHAR(20) NULL,
  observaciones TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by BIGINT NULL REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL,
  updated_by BIGINT NULL REFERENCES public.usuarios(id_usuario) ON DELETE SET NULL,
  CONSTRAINT programaciones_ejecuciones_estado_check
    CHECK (estado IN ('PENDIENTE', 'REPROGRAMADA', 'CANCELADA', 'COMPLETADA', 'GENERADA'))
);

CREATE INDEX IF NOT EXISTS idx_prog_ejec_programacion
  ON public.programaciones_ejecuciones(id_programacion);

CREATE INDEX IF NOT EXISTS idx_prog_ejec_fecha
  ON public.programaciones_ejecuciones(fecha_programada);

CREATE INDEX IF NOT EXISTS idx_prog_ejec_estado
  ON public.programaciones_ejecuciones(estado);
