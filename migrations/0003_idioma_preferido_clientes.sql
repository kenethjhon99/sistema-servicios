-- =============================================================================
-- 0003_idioma_preferido_clientes.sql
-- Soporte de documentos (PDF) en español/inglés.
--
-- Cuando se genera cualquier documento para un cliente (recibo, ticket,
-- informe, estado de cuenta, cotización), por defecto se usa el idioma
-- preferido del cliente. El operador puede hacer override manual con
-- ?lang=es|en al pedir el PDF.
-- =============================================================================

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS idioma_preferido VARCHAR(2) NOT NULL DEFAULT 'es';

-- Constraint separado para que sea idempotente con re-runs (DROP IF EXISTS
-- + ADD CONSTRAINT no es atómico — usamos DO block).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clientes_idioma_preferido_check'
  ) THEN
    ALTER TABLE public.clientes
      ADD CONSTRAINT clientes_idioma_preferido_check
      CHECK (idioma_preferido IN ('es', 'en'));
  END IF;
END$$;
