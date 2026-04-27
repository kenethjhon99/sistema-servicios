import { createToken } from "../../src/utils/jwt.js";

/**
 * Construye una fila "usuarios" canónica para tests.
 * Sólo override lo que necesites por test.
 */
export const makeUsuario = (overrides = {}) => ({
  id_usuario: 1,
  nombre: "Admin Test",
  correo: "admin@test.com",
  telefono: null,
  username: "admin",
  rol: "ADMIN",
  estado: "ACTIVO",
  ...overrides,
});

/**
 * Genera un token JWT a partir de un usuario.
 */
export const tokenFor = (usuario) =>
  createToken({
    id_usuario: usuario.id_usuario,
    username: usuario.username,
    rol: usuario.rol,
  });

/**
 * Cebar la primera llamada de pool.query con el SELECT del usuario
 * que hace `authRequired`. Devuelve el header Authorization listo.
 *
 * Uso típico:
 *   const usuario = makeUsuario({ rol: "ADMIN" });
 *   const auth = primeAuth(poolMock, usuario);
 *   poolMock.query.mockResolvedValueOnce({ rows: [...lo del handler...] });
 *   await request(app).get("/api/...").set("Authorization", auth);
 */
export const primeAuth = (poolMock, usuario) => {
  poolMock.query.mockResolvedValueOnce({ rows: [usuario] });
  return `Bearer ${tokenFor(usuario)}`;
};
