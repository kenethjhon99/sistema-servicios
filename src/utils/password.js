/**
 * Política de contraseñas del sistema.
 *
 * Reglas:
 *  - Mínimo 8 caracteres
 *  - Al menos una letra
 *  - Al menos un número
 *
 * Retorna { valid: true } si la contraseña cumple la política,
 * o { valid: false, error: "..." } con un mensaje claro en caso contrario.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const validarPassword = (password) => {
  if (!password || typeof password !== "string") {
    return {
      valid: false,
      error: "La contraseña es obligatoria",
    };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      error: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
    };
  }

  const tieneLetra = /[A-Za-z]/.test(password);
  const tieneNumero = /[0-9]/.test(password);

  if (!tieneLetra || !tieneNumero) {
    return {
      valid: false,
      error: "La contraseña debe incluir al menos una letra y un número",
    };
  }

  return { valid: true };
};
