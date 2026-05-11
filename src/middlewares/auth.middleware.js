import { pool } from "../config/db.js";
import { apiError } from "../i18n/apiMessages.js";
import { verifyToken } from "../utils/jwt.js";

export const authRequired = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return apiError(res, req, 401, "auth.missingToken");
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return apiError(res, req, 401, "auth.invalidTokenFormat");
    }

    const token = parts[1];
    const decoded = verifyToken(token);

    const userResult = await pool.query(
      `
        SELECT id_usuario, nombre, correo, telefono, username, rol, estado
        FROM usuarios
        WHERE id_usuario = $1
      `,
      [decoded.id_usuario]
    );

    if (userResult.rows.length === 0) {
      return apiError(res, req, 401, "auth.tokenUserNotFound");
    }

    const usuario = userResult.rows[0];

    if (usuario.estado !== "ACTIVO") {
      return apiError(res, req, 403, "auth.userInactive");
    }

    req.user = usuario;
    next();
  } catch (error) {
    console.error("Error en authRequired:", error);
    return apiError(res, req, 401, "auth.invalidOrExpiredToken");
  }
};

export const requireRole = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.user) {
      return apiError(res, req, 401, "auth.notAuthenticated");
    }

    if (!rolesPermitidos.includes(req.user.rol)) {
      return apiError(res, req, 403, "auth.forbidden");
    }

    next();
  };
};
