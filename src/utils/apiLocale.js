import { DEFAULT_LANG, SUPPORTED_LANGS } from "./idioma.js";

export const API_DEFAULT_LANG = "es";

const pickSupported = (value) => {
  if (!value) return null;
  const normalized = String(value).toLowerCase().trim();
  return SUPPORTED_LANGS.includes(normalized) ? normalized : null;
};

const fromAcceptLanguage = (headerValue) => {
  if (!headerValue) return null;

  const tokens = String(headerValue)
    .split(",")
    .map((token) => token.split(";")[0].trim().toLowerCase())
    .filter(Boolean);

  for (const token of tokens) {
    const short = token.slice(0, 2);
    if (SUPPORTED_LANGS.includes(short)) {
      return short;
    }
  }

  return null;
};

export const resolveApiLocale = (req) => {
  return (
    pickSupported(req?.query?.lang) ||
    pickSupported(req?.headers?.["x-app-locale"]) ||
    fromAcceptLanguage(req?.headers?.["accept-language"]) ||
    API_DEFAULT_LANG ||
    DEFAULT_LANG
  );
};
