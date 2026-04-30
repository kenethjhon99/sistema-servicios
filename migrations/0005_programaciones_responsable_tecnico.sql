ALTER TABLE public.programaciones_servicio
  ADD COLUMN IF NOT EXISTS id_empleado_responsable bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'programaciones_servicio_id_empleado_responsable_fkey'
  ) THEN
    ALTER TABLE public.programaciones_servicio
      ADD CONSTRAINT programaciones_servicio_id_empleado_responsable_fkey
      FOREIGN KEY (id_empleado_responsable)
      REFERENCES public.empleados(id_empleado)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_programaciones_id_empleado_responsable
  ON public.programaciones_servicio (id_empleado_responsable);
