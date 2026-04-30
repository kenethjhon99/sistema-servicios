ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS horas_trabajo_dia numeric(5,2),
  ADD COLUMN IF NOT EXISTS pago_diario numeric(12,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'empleados_horas_trabajo_dia_check'
  ) THEN
    ALTER TABLE public.empleados
      ADD CONSTRAINT empleados_horas_trabajo_dia_check
      CHECK (horas_trabajo_dia IS NULL OR horas_trabajo_dia >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'empleados_pago_diario_check'
  ) THEN
    ALTER TABLE public.empleados
      ADD CONSTRAINT empleados_pago_diario_check
      CHECK (pago_diario IS NULL OR pago_diario >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clientes'
      AND column_name = 'dpi'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clientes'
      AND column_name = 'id_documento'
  ) THEN
    ALTER TABLE public.clientes RENAME COLUMN dpi TO id_documento;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clientes'
      AND column_name = 'id_documento'
  ) THEN
    ALTER TABLE public.clientes
      ADD COLUMN id_documento character varying(30);
  END IF;
END $$;
