import bcrypt from "bcrypt";
import { pool } from "../config/db.js";
import { apiError, apiMessage } from "../i18n/apiMessages.js";
import { registrarAuditoria } from "../utils/auditoria.js";
import { resolveApiLocale } from "../utils/apiLocale.js";
import { BCRYPT_ROUNDS, validarPassword } from "../utils/password.js";

const ROLES_VALIDOS = ["ADMIN", "SUPERVISOR", "OPERADOR", "COBRADOR"];
const ESTADOS_VALIDOS = ["ACTIVO", "INACTIVO"];

export const listarUsuarios = async (req, res) => {
  try {
    const { estado, rol, busqueda } = req.query;
    const { page, limit, offset } = req.pagination || { page: 1, limit: 50, offset: 0 };

    let whereClause = " WHERE 1=1 ";
    const values = [];
    let index = 1;

    if (estado) {
      whereClause += ` AND estado = $${index}`;
      values.push(estado.toUpperCase());
      index++;
    }

    if (rol) {
      whereClause += ` AND rol = $${index}`;
      values.push(rol.toUpperCase());
      index++;
    }

    if (busqueda) {
      whereClause += ` AND (
        nombre ILIKE $${index}
        OR username ILIKE $${index}
        OR correo ILIKE $${index}
        OR telefono ILIKE $${index}
      )`;
      values.push(`%${busqueda}%`);
      index++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM usuarios ${whereClause}`,
      values
    );
    const total = countResult.rows[0].total;

    const dataQuery = `
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
      ${whereClause}
      ORDER BY id_usuario DESC
      LIMIT $${index} OFFSET $${index + 1}
    `;

    const { rows } = await pool.query(dataQuery, [...values, limit, offset]);

    return res.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error al listar usuarios:", error);
    return apiError(res, req, 500, "users.listError");
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
      return apiError(res, req, 404, "users.notFound");
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener usuario:", error);
    return apiError(res, req, 500, "users.fetchError");
  }
};

export const crearUsuario = async (req, res) => {
  try {
    const { nombre, correo, telefono, username, password, rol } = req.body;
    const locale = resolveApiLocale(req);

    if (!nombre || !nombre.trim()) {
      return apiError(res, req, 400, "users.nameRequired");
    }

    if (!username || !username.trim()) {
      return apiError(res, req, 400, "users.usernameRequired");
    }

    const passwordCheck = validarPassword(password, locale);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: passwordCheck.error });
    }

    if (!rol || !ROLES_VALIDOS.includes(rol.toUpperCase())) {
      return apiError(res, req, 400, "users.invalidRole");
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
      return apiError(res, req, 409, "users.duplicateUser");
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

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

    return res.status(201).json(usuario);
  } catch (error) {
    console.error("Error al crear usuario:", error);
    return apiError(res, req, 500, "users.createError");
  }
};

export const actualizarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, correo, telefono, username, rol } = req.body;

    if (!nombre || !nombre.trim()) {
      return apiError(res, req, 400, "users.nameRequired");
    }

    if (!username || !username.trim()) {
      return apiError(res, req, 400, "users.usernameRequired");
    }

    if (!rol || !ROLES_VALIDOS.includes(rol.toUpperCase())) {
      return apiError(res, req, 400, "users.invalidRole");
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
      return apiError(res, req, 404, "users.notFound");
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
      return apiError(res, req, 409, "users.duplicateOtherUser");
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

    return res.json(usuario);
  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    return apiError(res, req, 500, "users.updateError");
  }
};

export const cambiarEstadoUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado || !ESTADOS_VALIDOS.includes(estado.toUpperCase())) {
      return apiError(res, req, 400, "users.invalidState");
    }

    if (Number(req.user.id_usuario) === Number(id) && estado.toUpperCase() === "INACTIVO") {
      return apiError(res, req, 400, "users.cannotDeactivateSelf");
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
      return apiError(res, req, 404, "users.notFound");
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

    return res.json(usuario);
  } catch (error) {
    console.error("Error al cambiar estado del usuario:", error);
    return apiError(res, req, 500, "users.stateChangeError");
  }
};

export const cambiarMiPassword = async (req, res) => {
  try {
    const { password_actual, password_nueva, confirmar_password } = req.body;
    const locale = resolveApiLocale(req);

    if (!password_actual) {
      return apiError(res, req, 400, "users.currentPasswordRequired");
    }

    const passwordCheck = validarPassword(password_nueva, locale);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: passwordCheck.error });
    }

    if (password_nueva !== confirmar_password) {
      return apiError(res, req, 400, "users.confirmPasswordMismatch");
    }

    const userResult = await pool.query(
      `SELECT * FROM usuarios WHERE id_usuario = $1`,
      [req.user.id_usuario]
    );

    if (userResult.rows.length === 0) {
      return apiError(res, req, 404, "users.notFound");
    }

    const usuario = userResult.rows[0];
    const passwordOk = await bcrypt.compare(password_actual, usuario.password_hash);

    if (!passwordOk) {
      return apiError(res, req, 400, "users.currentPasswordIncorrect");
    }

    const mismaPassword = await bcrypt.compare(password_nueva, usuario.password_hash);
    if (mismaPassword) {
      return apiError(res, req, 400, "users.newPasswordSame");
    }

    const nuevoHash = await bcrypt.hash(password_nueva, BCRYPT_ROUNDS);

    await pool.query(
      `
        UPDATE usuarios
        SET password_hash = $1,
            updated_at = NOW()
        WHERE id_usuario = $2
      `,
      [nuevoHash, req.user.id_usuario]
    );

    return apiMessage(res, req, {}, "users.passwordUpdated");
  } catch (error) {
    console.error("Error al cambiar mi contraseña:", error);
    return apiError(res, req, 500, "users.passwordUpdateError");
  }
};

export const resetearPasswordUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { password_nueva, confirmar_password } = req.body;
    const locale = resolveApiLocale(req);

    const passwordCheck = validarPassword(password_nueva, locale);
    if (!passwordCheck.valid) {
      return res.status(400).json({ error: passwordCheck.error });
    }

    if (password_nueva !== confirmar_password) {
      return apiError(res, req, 400, "users.confirmPasswordMismatch");
    }

    const userResult = await pool.query(
      `SELECT id_usuario, username FROM usuarios WHERE id_usuario = $1`,
      [id]
    );

    if (userResult.rows.length === 0) {
      return apiError(res, req, 404, "users.notFound");
    }

    const usuario = userResult.rows[0];
    const nuevoHash = await bcrypt.hash(password_nueva, BCRYPT_ROUNDS);

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

    return apiMessage(res, req, {}, "users.passwordResetDone");
  } catch (error) {
    console.error("Error al resetear contraseña del usuario:", error);
    return apiError(res, req, 500, "users.passwordResetError");
  }
};
