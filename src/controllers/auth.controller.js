import bcrypt from "bcrypt";
import { pool } from "../config/db.js";
import { createToken } from "../utils/jwt.js";
import { registrarAuditoria } from "../utils/auditoria.js";

const ROLES_VALIDOS = ["ADMIN", "SUPERVISOR", "OPERADOR", "COBRADOR"];

export const registrarUsuario = async (req, res) => {
  try {
    const {
      nombre,
      correo,
      telefono,
      username,
      password,
      rol,
    } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    if (!username || !username.trim()) {
      return res.status(400).json({ error: "El username es obligatorio" });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        error: "La contraseña es obligatoria y debe tener al menos 6 caracteres",
      });
    }

    if (!rol || !ROLES_VALIDOS.includes(rol.toUpperCase())) {
      return res.status(400).json({ error: "Rol inválido" });
    }

    const existeUsuario = await pool.query(
      `
        SELECT id_usuario
        FROM usuarios
        WHERE username = $1
           OR (correo IS NOT NULL AND correo = $2)
      `,
      [username.trim(), correo?.trim() || null]
    );

    if (existeUsuario.rows.length > 0) {
      return res.status(409).json({
        error: "Ya existe un usuario con ese username o correo",
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO usuarios (
        nombre,
        correo,
        telefono,
        username,
        password_hash,
        rol
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id_usuario, nombre, correo, telefono, username, rol, estado, created_at;
    `;

    const values = [
      nombre.trim(),
      correo?.trim() || null,
      telefono?.trim() || null,
      username.trim(),
      password_hash,
      rol.toUpperCase(),
    ];

    const { rows } = await pool.query(query, values);

    return res.status(201).json({
      mensaje: "Usuario creado correctamente",
      usuario: rows[0],
    });
  } catch (error) {
    console.error("Error al registrar usuario:", error);
    return res.status(500).json({ error: "Error interno al registrar usuario" });
  }
};

export const loginUsuario = async (req, res) => {
  try {
    const { username, password } = req.body;
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
    return res.json({
      usuario: req.user,
    });
  } catch (error) {
    console.error("Error al obtener perfil:", error);
    return res.status(500).json({ error: "Error interno al obtener perfil" });
  }
};
