import bcrypt from "bcrypt";
import { pool } from "../config/db.js";
import { apiError, apiMessage } from "../i18n/apiMessages.js";
import { createToken } from "../utils/jwt.js";
import { registrarAuditoria } from "../utils/auditoria.js";

// Dummy bcrypt hash with the same cost factor as real users to avoid
// user enumeration by response timing.
const DUMMY_BCRYPT_HASH = "$2b$12$PT0fnocNWS9QmPk7GnexaenKUXPhn9vBV8OorEf4SFUBqWRCyGB2y";

export const loginUsuario = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !username.trim()) {
      return apiError(res, req, 400, "auth.usernameRequired");
    }

    if (!password) {
      return apiError(res, req, 400, "auth.passwordRequired");
    }

    const query = `
      SELECT *
      FROM usuarios
      WHERE username = $1
    `;

    const { rows } = await pool.query(query, [username.trim()]);

    if (rows.length === 0) {
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      return apiError(res, req, 401, "auth.invalidCredentials");
    }

    const usuario = rows[0];

    if (usuario.estado !== "ACTIVO") {
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      return apiError(res, req, 403, "auth.userInactive");
    }

    const passwordOk = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordOk) {
      return apiError(res, req, 401, "auth.invalidCredentials");
    }

    await registrarAuditoria({
      tabla_afectada: "usuarios",
      id_registro: usuario.id_usuario,
      accion: "LOGIN",
      descripcion: `Inicio de sesión exitoso del usuario ${usuario.username}`,
      valores_nuevos: {
        username: usuario.username,
        rol: usuario.rol,
      },
      realizado_por: usuario.id_usuario,
    });

    const token = createToken({
      id_usuario: usuario.id_usuario,
      username: usuario.username,
      rol: usuario.rol,
    });

    return apiMessage(res, req, {
      token,
      usuario: {
        id_usuario: usuario.id_usuario,
        nombre: usuario.nombre,
        correo: usuario.correo,
        telefono: usuario.telefono,
        username: usuario.username,
        rol: usuario.rol,
        estado: usuario.estado,
      },
    }, "auth.loginSuccess");
  } catch (error) {
    console.error("Error al hacer login:", error);
    return apiError(res, req, 500, "auth.loginError");
  }
};

export const perfilUsuario = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT
          id_usuario,
          nombre,
          correo,
          telefono,
          username,
          rol,
          estado,
          created_at,
          updated_at
        FROM usuarios
        WHERE id_usuario = $1
      `,
      [req.user.id_usuario]
    );

    if (rows.length === 0) {
      return apiError(res, req, 404, "auth.userNotFound");
    }

    return res.json({
      usuario: rows[0],
    });
  } catch (error) {
    console.error("Error al obtener perfil:", error);
    return apiError(res, req, 500, "auth.profileError");
  }
};
