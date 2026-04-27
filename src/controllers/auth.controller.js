import bcrypt from "bcrypt";
import { pool } from "../config/db.js";
import { createToken } from "../utils/jwt.js";
import { registrarAuditoria } from "../utils/auditoria.js";

// Hash dummy de bcrypt con los mismos costos (BCRYPT_ROUNDS=12) que un
// usuario real. Se usa para gastar el mismo tiempo en bcrypt.compare cuando
// el usuario del login NO existe — así un atacante no puede enumerar usuarios
// válidos midiendo el tiempo de respuesta.
//
// IMPORTANTE: si cambia BCRYPT_ROUNDS en utils/password.js, regenerar este
// hash con: node -e "import('bcrypt').then(b => b.default.hash('x', 12).then(console.log))"
const DUMMY_BCRYPT_HASH = "$2b$12$PT0fnocNWS9QmPk7GnexaenKUXPhn9vBV8OorEf4SFUBqWRCyGB2y";

export const loginUsuario = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !username.trim()) {
      return res.status(400).json({ error: "El username es obligatorio" });
    }

    if (!password) {
      return res.status(400).json({ error: "La contraseña es obligatoria" });
    }

    const query = `
      SELECT *
      FROM usuarios
      WHERE username = $1
    `;

    const { rows } = await pool.query(query, [username.trim()]);

    if (rows.length === 0) {
      // Compare contra hash dummy para gastar el mismo tiempo y no
      // filtrar "el usuario no existe" vía timing.
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const usuario = rows[0];

    if (usuario.estado !== "ACTIVO") {
      // Compare aquí también — un atacante podría distinguir
      // "existe pero inactivo" vs "no existe" si saltamos bcrypt.
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      return res.status(403).json({ error: "Usuario inactivo" });
    }

    const passwordOk = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordOk) {
      return res.status(401).json({ error: "Credenciales inválidas" });
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

    return res.json({
      mensaje: "Login exitoso",
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
    });
  } catch (error) {
    console.error("Error al hacer login:", error);
    return res.status(500).json({ error: "Error interno al hacer login" });
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
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    return res.json({
      usuario: rows[0],
    });
  } catch (error) {
    console.error("Error al obtener perfil:", error);
    return res.status(500).json({ error: "Error interno al obtener perfil" });
  }
};
