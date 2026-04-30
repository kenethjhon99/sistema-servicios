ALTER TABLE public.ordenes_trabajo_detalle
  ADD COLUMN IF NOT EXISTS requiere_materiales boolean NOT NULL DEFAULT false;

ALTER TABLE public.ordenes_trabajo_detalle
  ADD COLUMN IF NOT EXISTS tipo_material character varying(150);

ALTER TABLE public.ordenes_trabajo_detalle
  ADD COLUMN IF NOT EXISTS precio_material_extra numeric(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ordenes_trabajo_detalle_precio_material_extra_check'
  ) THEN
    ALTER TABLE public.ordenes_trabajo_detalle
      ADD CONSTRAINT ordenes_trabajo_detalle_precio_material_extra_check
      CHECK (precio_material_extra >= 0);
  END IF;
END $$;
