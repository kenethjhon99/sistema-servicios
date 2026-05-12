ALTER TABLE cobranza_seguimientos
  ADD COLUMN IF NOT EXISTS id_usuario_responsable BIGINT NULL REFERENCES usuarios(id_usuario) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cobranza_seguimientos_responsable
  ON cobranza_seguimientos(id_usuario_responsable);
