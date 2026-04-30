-- =============================================================================
-- 0004_auditoria_accion_convertir.sql
-- Agrega la acción 'CONVERTIR' al CHECK de auditoria_eventos.accion.
--
-- Necesaria para registrar la transición Cotización APROBADA → Orden de
-- trabajo (módulo de cotizaciones / estimados).
-- =============================================================================

-- Drop + add (no hay forma estándar idempotente para CHECK, pero usamos
-- nombre fijo del constraint y DROP IF EXISTS).
ALTER TABLE public.auditoria_eventos
  DROP CONSTRAINT IF EXISTS auditoria_eventos_accion_check;

ALTER TABLE public.auditoria_eventos
  ADD CONSTRAINT auditoria_eventos_accion_check
  CHECK (
    accion IN (
      'CREAR',
      'ACTUALIZAR',
      'CAMBIAR_ESTADO',
      'CANCELAR',
      'CONVERTIR',
      'LOGIN',
      'RESET_PASSWORD',
      'PAGO',
      'ABONO'
    )
  );
