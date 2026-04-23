import bcrypt from "bcrypt";
import { pool } from "../config/db.js";
import { registrarAuditoria } from "../utils/auditoria.js";

const ROLES_VALIDOS = ["ADMIN", "SUPERVISOR", "OPERADOR", "COBRADOR"];
const ESTADOS_VALIDOS = ["ACTIVO", "INACTIVO"];

export const listarUsuarios = async (req, res) => {
  try {
    const { estado, rol, busqueda } = req.query;

    let query = `
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
      WHERE 1=1
    `;

    const values = [];
    let index = 1;

    if (estado) {
      query += ` AND estado = $${index}`;
      values.push(estado.toUpperCase());
      index++;
    }

    if (rol) {
      query += ` AND rol = $${index}`;
      values.push(rol.toUpperCase());
      index++;
    }

    if (busqueda) {
      query += ` AND (
        nombre ILIKE $${index}
        OR username ILIKE $${index}
        OR correo ILIKE $${index}
        OR telefono ILIKE $${index}
      )`;
      values.push(`%${busqueda}%`);
      index++;
    }

    query += ` ORDER BY id_usuario DESC`;

    const { rows } = await pool.query(query, values);
    return res.json(rows);
  } catch (error) {
    console.error("Error al listar usuarios:", error);
    return res.status(500).json({ error: "Error interno al listar usuarios" });
  }
};

export const obtenerUsuarioPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
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
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener usuario:", error);
    return res.status(500).json({ error: "Error interno al obtener usuario" });
  }
};

export const crearUsuario = async (req, res) => {
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

    const ROLES_VALIDOS = ["ADMIN", "SUPERVISOR", "OPERADOR", "COBRADOR"];
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
        rol,
        created_by,
        updated_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING
        id_usuario,
        nombre,
        correo,
        telefono,
        username,
        rol,
        estado,
        created_at,
        updated_at,
        created_by,
        updated_by
    `;

    const values = [
      nombre.trim(),
      correo?.trim() || null,
      telefono?.trim() || null,
      username.trim(),
      password_hash,
      rol.toUpperCase(),
      req.user?.id_usuario || null,
      req.user?.id_usuario || null,
    ];

    const { rows } = await pool.query(query, values);
    const usuario = rows[0];

    await registrarAuditoria({
      tabla_afectada: "usuarios",
      id_registro: usuario.id_usuario,
      accion: "CREAR",
      descripcion: `Se creó el usuario ${usuario.username}`,
      valores_nuevos: usuario,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.status(201).json({
      mensaje: "Usuario creado correctamente",
      usuario,
    });
  } catch (error) {
    console.error("Error al crear usuario:", error);
    return res.status(500).json({ error: "Error interno al crear usuario" });
  }
};

export const actualizarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      correo,
      telefono,
      username,
      rol,
    } = req.body;

    const ROLES_VALIDOS = ["ADMIN", "SUPERVISOR", "OPERADOR", "COBRADOR"];

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    if (!username || !username.trim()) {
      return res.status(400).json({ error: "El username es obligatorio" });
    }

    if (!rol || !ROLES_VALIDOS.includes(rol.toUpperCase())) {
      return res.status(400).json({ error: "Rol inválido" });
    }

    const anteriorResult = await pool.query(
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
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const anterior = anteriorResult.rows[0];

    const existeDuplicado = await pool.query(
      `
        SELECT id_usuario
        FROM usuarios
        WHERE (username = $1 OR (correo IS NOT NULL AND correo = $2))
          AND id_usuario <> $3
      `,
      [username.trim(), correo?.trim() || null, id]
    );

    if (existeDuplicado.rows.length > 0) {
      return res.status(409).json({
        error: "Ya existe otro usuario con ese username o correo",
      });
    }

    const query = `
      UPDATE usuarios
      SET nombre = $1,
          correo = $2,
          telefono = $3,
          username = $4,
          rol = $5,
          updated_by = $6,
          updated_at = NOW()
      WHERE id_usuario = $7
      RETURNING
        id_usuario,
        nombre,
        correo,
        telefono,
        username,
        rol,
        estado,
        created_at,
        updated_at,
        created_by,
        updated_by
    `;

    const values = [
      nombre.trim(),
      correo?.trim() || null,
      telefono?.trim() || null,
      username.trim(),
      rol.toUpperCase(),
      req.user?.id_usuario || null,
      id,
    ];

    const { rows } = await pool.query(query, values);
    const usuario = rows[0];

    await registrarAuditoria({
      tabla_afectada: "usuarios",
      id_registro: usuario.id_usuario,
      accion: "ACTUALIZAR",
      descripcion: `Se actualizó el usuario ${usuario.username}`,
      valores_anteriores: anterior,
      valores_nuevos: usuario,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json({
      mensaje: "Usuario actualizado correctamente",
      usuario,
    });
  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    return res.status(500).json({ error: "Error interno al actualizar usuario" });
  }
};

export const cambiarEstadoUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    const ESTADOS_VALIDOS = ["ACTIVO", "INACTIVO"];

    if (!estado || !ESTADOS_VALIDOS.includes(estado.toUpperCase())) {
      return res.status(400).json({ error: "Estado inválido" });
    }

    if (Number(req.user.id_usuario) === Number(id) && estado.toUpperCase() === "INACTIVO") {
      return res.status(400).json({ error: "No puedes inactivar tu propio usuario" });
    }

    const anteriorResult = await pool.query(
      `
        SELECT
          id_usuario,
          nombre,
          correo,
          telefono,
          username,
          rol,
          estado
        FROM usuarios
        WHERE id_usuario = $1
      `,
      [id]
    );

    if (anteriorResult.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const anterior = anteriorResult.rows[0];

    const query = `
      UPDATE usuarios
      SET estado = $1,
          updated_by = $2,
          updated_at = NOW()
      WHERE id_usuario = $3
      RETURNING
        id_usuario,
        nombre,
        correo,
        telefono,
        username,
        rol,
        estado,
        created_at,
        updated_at,
        created_by,
        updated_by
    `;

    const { rows } = await pool.query(query, [
      estado.toUpperCase(),
      req.user?.id_usuario || null,
      id,
    ]);

    const usuario = rows[0];

    await registrarAuditoria({
      tabla_afectada: "usuarios",
      id_registro: usuario.id_usuario,
      accion: "CAMBIAR_ESTADO",
      descripcion: `Se cambió el estado del usuario ${usuario.username} a ${usuario.estado}`,
      valores_anteriores: anterior,
      valores_nuevos: usuario,
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json({
      mensaje: "Estado de usuario actualizado correctamente",
      usuario,
    });
  } catch (error) {
    console.error("Error al cambiar estado del usuario:", error);
    return res.status(500).json({ error: "Error interno al cambiar estado del usuario" });
  }
};

export const cambiarMiPassword = async (req, res) => {
  try {
    const { password_actual, password_nueva, confirmar_password } = req.body;

    if (!password_actual) {
      return res.status(400).json({ error: "La contraseña actual es obligatoria" });
    }

    if (!password_nueva || password_nueva.length < 6) {
      return res.status(400).json({
        error: "La nueva contraseña es obligatoria y debe tener al menos 6 caracteres",
      });
    }

    if (password_nueva !== confirmar_password) {
      return res.status(400).json({ error: "La confirmación de contraseña no coincide" });
    }

    const userResult = await pool.query(
      `SELECT * FROM usuarios WHERE id_usuario = $1`,
      [req.user.id_usuario]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const usuario = userResult.rows[0];

    const passwordOk = await bcrypt.compare(password_actual, usuario.password_hash);

    if (!passwordOk) {
      return res.status(400).json({ error: "La contraseña actual es incorrecta" });
    }

    const mismaPassword = await bcrypt.compare(password_nueva, usuario.password_hash);
    if (mismaPassword) {
      return res.status(400).json({
        error: "La nueva contraseña no puede ser igual a la actual",
      });
    }

    const nuevoHash = await bcrypt.hash(password_nueva, 10);

    await pool.query(
      `
        UPDATE usuarios
        SET password_hash = $1,
            updated_at = NOW()
        WHERE id_usuario = $2
      `,
      [nuevoHash, req.user.id_usuario]
    );

    return res.json({
      mensaje: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    console.error("Error al cambiar mi contraseña:", error);
    return res.status(500).json({ error: "Error interno al cambiar la contraseña" });
  }
};

export const resetearPasswordUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { password_nueva, confirmar_password } = req.body;

    if (!password_nueva || password_nueva.length < 6) {
      return res.status(400).json({
        error: "La nueva contraseña es obligatoria y debe tener al menos 6 caracteres",
      });
    }

    if (password_nueva !== confirmar_password) {
      return res.status(400).json({ error: "La confirmación de contraseña no coincide" });
    }

    const userResult = await pool.query(
      `SELECT id_usuario, username FROM usuarios WHERE id_usuario = $1`,
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const usuario = userResult.rows[0];
    const nuevoHash = await bcrypt.hash(password_nueva, 10);

    await pool.query(
      `
        UPDATE usuarios
        SET password_hash = $1,
            updated_by = $2,
            updated_at = NOW()
        WHERE id_usuario = $3
      `,
      [nuevoHash, req.user?.id_usuario || null, id]
    );

    await registrarAuditoria({
      tabla_afectada: "usuarios",
      id_registro: usuario.id_usuario,
      accion: "RESET_PASSWORD",
      descripcion: `Se reseteó la contraseña del usuario ${usuario.username}`,
      valores_nuevos: { password_reseteado: true },
      realizado_por: req.user?.id_usuario || null,
    });

    return res.json({
      mensaje: "Contraseña reseteada correctamente",
    });
  } catch (error) {
    console.error("Error al resetear contraseña del usuario:", error);
    return res.status(500).json({ error: "Error interno al resetear contraseña" });
  }
};