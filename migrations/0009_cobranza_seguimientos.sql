CREATE TABLE IF NOT EXISTS cobranza_seguimientos (
  id_seguimiento BIGSERIAL PRIMARY KEY,
  id_cliente BIGINT NOT NULL REFERENCES clientes(id_cliente) ON DELETE CASCADE,
  id_credito BIGINT NULL REFERENCES creditos(id_credito) ON DELETE SET NULL,
  fecha_seguimiento DATE NOT NULL DEFAULT CURRENT_DATE,
  medio_contacto VARCHAR(30) NOT NULL DEFAULT 'LLAMADA',
  resultado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
  proximo_contacto DATE NULL,
  notas TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);

CREATE INDEX IF NOT EXISTS idx_cobranza_seguimientos_cliente
  ON cobranza_seguimientos(id_cliente, fecha_seguimiento DESC, id_seguimiento DESC);

CREATE INDEX IF NOT EXISTS idx_cobranza_seguimientos_credito
  ON cobranza_seguimientos(id_credito);

CREATE INDEX IF NOT EXISTS idx_cobranza_seguimientos_proximo_contacto
  ON cobranza_seguimientos(proximo_contacto);
