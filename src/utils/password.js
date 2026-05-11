import { tApi } from "../i18n/apiMessages.js";
import { API_DEFAULT_LANG } from "./apiLocale.js";

/**
 * Password policy for the system.
 *
 * Rules:
 *  - Minimum 8 characters
 *  - At least one letter
 *  - At least one number
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Cost factor for bcrypt hashing.
 */
export const BCRYPT_ROUNDS = 12;

export const validarPassword = (password, locale = API_DEFAULT_LANG) => {
  if (!password || typeof password !== "string") {
    return {
      valid: false,
      error: tApi(locale, "password.required"),
    };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      error: tApi(locale, "password.minLength", { minLength: PASSWORD_MIN_LENGTH }),
    };
  }

  const tieneLetra = /[A-Za-z]/.test(password);
  const tieneNumero = /[0-9]/.test(password);

  if (!tieneLetra || !tieneNumero) {
    return {
      valid: false,
      error: tApi(locale, "password.letterAndNumber"),
    };
  }

  return { valid: true };
};
