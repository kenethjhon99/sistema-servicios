/**
 * Validador de URLs para campos almacenados que luego se renderizan
 * en el frontend (href, src). Acepta sólo http/https.
 *
 * Bloquea:
 *  - javascript:alert(...)        ← XSS clásico
 *  - data:text/html;base64,...    ← XSS via data URL
 *  - file://, ftp://, vbscript:   ← otros protocolos peligrosos
 *
 * Devuelve { valid: true } o { valid: false, error: "mensaje" }.
 */
export const validarUrlPublica = (url) => {
  if (typeof url !== "string" || url.trim() === "") {
    return { valid: false, error: "La URL es obligatoria" };
  }

  const trimmed = url.trim();

  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      valid: false,
      error: "La URL debe comenzar con http:// o https://",
    };
  }

  try {
    // eslint-disable-next-line no-new
    new URL(trimmed);
  } catch {
    return { valid: false, error: "La URL no tiene un formato válido" };
  }

  return { valid: true };
};
