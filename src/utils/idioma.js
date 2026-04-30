/**
 * Resolución del idioma para documentos generados.
 *
 * Prioridad:
 *  1. Query param ?lang=es|en  ← override manual del operador
 *  2. cliente.idioma_preferido ← preferencia guardada
 *  3. 'es'                     ← fallback
 *
 * Sólo se aceptan los idiomas listados en SUPPORTED_LANGS para evitar
 * que un atacante meta strings raros ('../', '<script>') que podrían
 * confundir templates futuros.
 */
export const SUPPORTED_LANGS = ["es", "en"];
export const DEFAULT_LANG = "en";

export const resolverIdioma = ({ queryLang, clienteLang } = {}) => {
  if (queryLang && SUPPORTED_LANGS.includes(queryLang)) {
    return queryLang;
  }
  if (clienteLang && SUPPORTED_LANGS.includes(clienteLang)) {
    return clienteLang;
  }
  return DEFAULT_LANG;
};
