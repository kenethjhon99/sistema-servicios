import bcrypt from "bcrypt";
import { pool } from "../config/db.js";
import { createToken } from "../utils/jwt.js";
import { registrarAuditoria } from "../utils/auditoria.js";

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
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const usuario = rows[0];

    if (usuario.estado !== "ACTIVO") {
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
