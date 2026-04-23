import { pool } from "../config/db.js";

/**
 * Registra un evento de auditoría.
 * Puede usarse con pool o con un client de transacción.
 */
export const registrarAuditoria = async ({
  client = null,
  tabla_afectada,
  id_registro,
  accion,
  descripcion = null,
  valores_anteriores = null,
  valores_nuevos = null,
  realizado_por = null,
}) => {
  const executor = client || pool;

  const query = `
    INSERT INTO auditoria_eventos (
      tabla_afectada,
      id_registro,
      accion,
      descripcion,
      valores_anteriores,
      valores_nuevos,
      realizado_por
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
  `;

  const values = [
    tabla_afectada,
    id_registro,
    accion,
    descripcion,
    valores_anteriores ? JSON.stringify(valores_anteriores) : null,
    valores_nuevos ? JSON.stringify(valores_nuevos) : null,
    realizado_por,
  ];

  await executor.query(query, values);
};