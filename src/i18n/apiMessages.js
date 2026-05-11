import { resolveApiLocale, API_DEFAULT_LANG } from "../utils/apiLocale.js";
import { SUPPORTED_LANGS } from "../utils/idioma.js";

const MESSAGES = {
  es: {
    auth: {
      usernameRequired: "El username es obligatorio",
      passwordRequired: "La contraseña es obligatoria",
      invalidCredentials: "Credenciales inválidas",
      userInactive: "Usuario inactivo",
      loginSuccess: "Login exitoso",
      userNotFound: "Usuario no encontrado",
      profileError: "Error interno al obtener perfil",
      loginError: "Error interno al hacer login",
      missingToken: "Sin token de autorización",
      invalidTokenFormat: "Formato de token inválido. Use Bearer TOKEN",
      tokenUserNotFound: "Usuario del token no encontrado",
      invalidOrExpiredToken: "Token inválido o expirado",
      notAuthenticated: "Usuario no autenticado",
      forbidden: "No tienes permisos para realizar esta acción",
      tooManyLoginAttempts: "Demasiados intentos de login. Intenta de nuevo en unos minutos.",
      tooManyAuthRequests: "Demasiadas peticiones al módulo de autenticación.",
    },
    common: {
      tooManyRequests: "Demasiadas peticiones. Intenta de nuevo en unos minutos.",
      missingParam: "Falta el parámetro {paramName}",
      invalidPositiveIntParam: "El parámetro {paramName} debe ser un entero positivo",
    },
    password: {
      required: "La contraseña es obligatoria",
      minLength: "La contraseña debe tener al menos {minLength} caracteres",
      letterAndNumber: "La contraseña debe incluir al menos una letra y un número",
    },
    users: {
      listError: "Error interno al listar usuarios",
      fetchError: "Error interno al obtener usuario",
      notFound: "Usuario no encontrado",
      nameRequired: "El nombre es obligatorio",
      usernameRequired: "El username es obligatorio",
      invalidRole: "Rol inválido",
      duplicateUser: "Ya existe un usuario con ese username o correo",
      duplicateOtherUser: "Ya existe otro usuario con ese username o correo",
      createError: "Error interno al crear usuario",
      updateError: "Error interno al actualizar usuario",
      invalidState: "Estado inválido",
      cannotDeactivateSelf: "No puedes inactivar tu propio usuario",
      stateChangeError: "Error interno al cambiar estado del usuario",
      currentPasswordRequired: "La contraseña actual es obligatoria",
      confirmPasswordMismatch: "La confirmación de contraseña no coincide",
      currentPasswordIncorrect: "La contraseña actual es incorrecta",
      newPasswordSame: "La nueva contraseña no puede ser igual a la actual",
      passwordUpdated: "Contraseña actualizada correctamente",
      passwordUpdateError: "Error interno al cambiar la contraseña",
      passwordResetDone: "Contraseña reseteada correctamente",
      passwordResetError: "Error interno al resetear contraseña",
    },
  },
  en: {
    auth: {
      usernameRequired: "Username is required",
      passwordRequired: "Password is required",
      invalidCredentials: "Invalid credentials",
      userInactive: "Inactive user",
      loginSuccess: "Login successful",
      userNotFound: "User not found",
      profileError: "Internal error while loading profile",
      loginError: "Internal error while signing in",
      missingToken: "Missing authorization token",
      invalidTokenFormat: "Invalid token format. Use Bearer TOKEN",
      tokenUserNotFound: "Token user not found",
      invalidOrExpiredToken: "Invalid or expired token",
      notAuthenticated: "User not authenticated",
      forbidden: "You do not have permission to perform this action",
      tooManyLoginAttempts: "Too many login attempts. Please try again in a few minutes.",
      tooManyAuthRequests: "Too many requests to the authentication module.",
    },
    common: {
      tooManyRequests: "Too many requests. Please try again in a few minutes.",
      missingParam: "Missing parameter {paramName}",
      invalidPositiveIntParam: "Parameter {paramName} must be a positive integer",
    },
    password: {
      required: "Password is required",
      minLength: "Password must be at least {minLength} characters long",
      letterAndNumber: "Password must include at least one letter and one number",
    },
    users: {
      listError: "Internal error while listing users",
      fetchError: "Internal error while loading user",
      notFound: "User not found",
      nameRequired: "Name is required",
      usernameRequired: "Username is required",
      invalidRole: "Invalid role",
      duplicateUser: "A user with that username or email already exists",
      duplicateOtherUser: "Another user with that username or email already exists",
      createError: "Internal error while creating user",
      updateError: "Internal error while updating user",
      invalidState: "Invalid status",
      cannotDeactivateSelf: "You cannot deactivate your own user",
      stateChangeError: "Internal error while changing user status",
      currentPasswordRequired: "Current password is required",
      confirmPasswordMismatch: "Password confirmation does not match",
      currentPasswordIncorrect: "Current password is incorrect",
      newPasswordSame: "New password cannot be the same as the current password",
      passwordUpdated: "Password updated successfully",
      passwordUpdateError: "Internal error while changing password",
      passwordResetDone: "Password reset successfully",
      passwordResetError: "Internal error while resetting password",
    },
  },
};

const getTemplate = (locale, key) => {
  const safeLocale = SUPPORTED_LANGS.includes(locale) ? locale : API_DEFAULT_LANG;
  const segments = key.split(".");

  let template = MESSAGES[safeLocale];
  for (const segment of segments) {
    template = template?.[segment];
  }

  if (typeof template === "string") {
    return template;
  }

  let fallback = MESSAGES[API_DEFAULT_LANG];
  for (const segment of segments) {
    fallback = fallback?.[segment];
  }

  return typeof fallback === "string" ? fallback : key;
};

export const tApi = (locale, key, params = {}) => {
  const template = getTemplate(locale, key);

  return Object.entries(params).reduce(
    (text, [paramKey, value]) => text.replaceAll(`{${paramKey}}`, String(value)),
    template
  );
};

export const apiError = (res, req, status, key, params = {}, extra = {}) => {
  return res.status(status).json({
    error: tApi(resolveApiLocale(req), key, params),
    ...extra,
  });
};

export const apiMessage = (res, req, payload, key, params = {}, status = 200) => {
  return res.status(status).json({
    ...payload,
    mensaje: tApi(resolveApiLocale(req), key, params),
  });
};

export const localizeInlineText = (req, esText, enText) => {
  return resolveApiLocale(req) === "en" ? enText : esText;
};

export const apiErrorText = (res, req, status, esText, enText, extra = {}) => {
  return res.status(status).json({
    error: localizeInlineText(req, esText, enText),
    ...extra,
  });
};

export const apiMessageText = (res, req, payload, esText, enText, status = 200) => {
  return res.status(status).json({
    ...payload,
    mensaje: localizeInlineText(req, esText, enText),
  });
};
