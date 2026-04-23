import { verifyToken } from "../utils/jwt.js";
import { pool } from "../config/db.js";

export const authRequired = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Sin token de autorización" });
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ error: "Formato de token inválido. Use Bearer TOKEN" });
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
      return res.status(401).json({ error: "Usuario del token no encontrado" });
    }

    const usuario = userResult.rows[0];

    if (usuario.estado !== "ACTIVO") {
      return res.status(403).json({ error: "Usuario inactivo" });
    }

    req.user = usuario;
    next();
  } catch (error) {
    console.error("Error en authRequired:", error);
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
};

export const requireRole = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Usuario no autenticado" });
    }

    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({
        error: "No tienes permisos para realizar esta acción",
      });
    }

    next();
  };
};