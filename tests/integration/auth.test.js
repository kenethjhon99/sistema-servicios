import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";

/**
 * Mock del pool. Cada test configura su propia respuesta con
 * poolMock.query.mockResolvedValueOnce(...).
 */
const poolMock = {
  query: vi.fn(),
  on: vi.fn(),
};

vi.mock("../../src/config/db.js", () => ({
  pool: poolMock,
  testDB: vi.fn(),
}));

let app;
let jwtUtils;

beforeAll(async () => {
  app = (await import("../../src/app.js")).default;
  jwtUtils = await import("../../src/utils/jwt.js");
});

beforeEach(() => {
  poolMock.query.mockReset();
});

/**
 * Genera una fila "usuarios" realista para tests.
 */
const mockUsuarioRow = async (overrides = {}) => ({
  id_usuario: 1,
  nombre: "Test User",
  correo: "test@example.com",
  telefono: null,
  username: "testuser",
  rol: "ADMIN",
  estado: "ACTIVO",
  password_hash: await bcrypt.hash("Password123", 4),
  ...overrides,
});

describe("POST /api/auth/login — validaciones", () => {
  it("responde 400 si falta username", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ password: "Password123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/username/i);
  });

  it("responde 400 si falta password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "testuser" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/contraseña/i);
  });

  it("responde 400 si username es string vacío", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "   ", password: "x" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login — flujo de credenciales", () => {
  it("responde 401 cuando el usuario no existe", async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "noexiste", password: "Password123" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/credenciales/i);
  });

  it("responde 403 cuando el usuario existe pero está INACTIVO", async () => {
    const usuario = await mockUsuarioRow({ estado: "INACTIVO" });
    poolMock.query.mockResolvedValueOnce({ rows: [usuario] });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "testuser", password: "Password123" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/inactivo/i);
  });

  it("responde 401 cuando la password es incorrecta", async () => {
    const usuario = await mockUsuarioRow();
    poolMock.query.mockResolvedValueOnce({ rows: [usuario] });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "testuser", password: "incorrecta" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/credenciales/i);
  });

  it("responde 200 con token y usuario cuando las credenciales son válidas", async () => {
    const usuario = await mockUsuarioRow();
    // 1) SELECT usuario, 2) INSERT auditoría
    poolMock.query
      .mockResolvedValueOnce({ rows: [usuario] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "testuser", password: "Password123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.mensaje).toMatch(/login/i);
    expect(res.body.usuario).toMatchObject({
      id_usuario: 1,
      username: "testuser",
      rol: "ADMIN",
      estado: "ACTIVO",
    });
    // password_hash no debe filtrarse en la respuesta
    expect(res.body.usuario.password_hash).toBeUndefined();
  });

  it("el token emitido contiene id_usuario, username y rol", async () => {
    const usuario = await mockUsuarioRow();
    poolMock.query
      .mockResolvedValueOnce({ rows: [usuario] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "testuser", password: "Password123" });

    const decoded = jwtUtils.verifyToken(res.body.token);
    expect(decoded).toMatchObject({
      id_usuario: 1,
      username: "testuser",
      rol: "ADMIN",
    });
  });

  it("registra evento de auditoría tras login exitoso", async () => {
    const usuario = await mockUsuarioRow();
    poolMock.query
      .mockResolvedValueOnce({ rows: [usuario] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post("/api/auth/login")
      .send({ username: "testuser", password: "Password123" });

    // 2 llamadas: SELECT del usuario + INSERT auditoría
    expect(poolMock.query).toHaveBeenCalledTimes(2);

    const auditCall = poolMock.query.mock.calls[1];
    expect(auditCall[0]).toMatch(/INSERT INTO auditoria_eventos/i);
    // accion = 'LOGIN' es el 3er placeholder
    expect(auditCall[1][2]).toBe("LOGIN");
  });
});

// ─── PROTECCIÓN ANTI-TIMING-ATTACK ──────────────────────────────────────
// Sin el dummy compare, un atacante puede enumerar usuarios válidos
// midiendo el tiempo: respuesta inmediata = no existe, ~100ms = existe.
describe("POST /api/auth/login — constant-time (anti timing attack)", () => {
  let bcryptSpy;

  beforeEach(() => {
    bcryptSpy = vi.spyOn(bcrypt, "compare");
  });

  afterEach(() => {
    bcryptSpy.mockRestore();
  });

  it("invoca bcrypt.compare incluso cuando el usuario NO existe", async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post("/api/auth/login")
      .send({ username: "fantasma", password: "loquesea" });

    expect(bcryptSpy).toHaveBeenCalledTimes(1);
    // El hash usado debe ser el dummy ($2b$10$...), no un null/undefined
    const [, hashUsado] = bcryptSpy.mock.calls[0];
    expect(typeof hashUsado).toBe("string");
    expect(hashUsado).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it("invoca bcrypt.compare incluso cuando el usuario está INACTIVO", async () => {
    const usuario = await mockUsuarioRow({ estado: "INACTIVO" });
    poolMock.query.mockResolvedValueOnce({ rows: [usuario] });

    await request(app)
      .post("/api/auth/login")
      .send({ username: "testuser", password: "loquesea" });

    expect(bcryptSpy).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/auth/perfil — authRequired", () => {
  it("responde 401 sin header Authorization", async () => {
    const res = await request(app).get("/api/auth/perfil");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/token/i);
  });

  it("responde 401 con formato de token inválido", async () => {
    const res = await request(app)
      .get("/api/auth/perfil")
      .set("Authorization", "Basic abc123");

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Bearer/i);
  });

  it("responde 401 con token mal firmado", async () => {
    const res = await request(app)
      .get("/api/auth/perfil")
      .set("Authorization", "Bearer not.a.real.token");

    expect(res.status).toBe(401);
  });

  it("responde 401 cuando el usuario del token ya no existe", async () => {
    const token = jwtUtils.createToken({ id_usuario: 999 });
    poolMock.query.mockResolvedValueOnce({ rows: [] }); // authRequired: usuario no encontrado

    const res = await request(app)
      .get("/api/auth/perfil")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no encontrado/i);
  });

  it("responde 403 cuando el usuario del token está INACTIVO", async () => {
    const usuario = await mockUsuarioRow({ estado: "INACTIVO" });
    const token = jwtUtils.createToken({ id_usuario: usuario.id_usuario });
    poolMock.query.mockResolvedValueOnce({ rows: [usuario] });

    const res = await request(app)
      .get("/api/auth/perfil")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/inactivo/i);
  });

  it("responde 200 con los datos del usuario cuando el token es válido", async () => {
    const usuario = await mockUsuarioRow();
    const token = jwtUtils.createToken({ id_usuario: usuario.id_usuario });

    // 1) authRequired SELECT, 2) perfilUsuario SELECT
    poolMock.query
      .mockResolvedValueOnce({ rows: [usuario] })
      .mockResolvedValueOnce({
        rows: [
          {
            id_usuario: usuario.id_usuario,
            nombre: usuario.nombre,
            correo: usuario.correo,
            telefono: usuario.telefono,
            username: usuario.username,
            rol: usuario.rol,
            estado: usuario.estado,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

    const res = await request(app)
      .get("/api/auth/perfil")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.usuario).toMatchObject({
      id_usuario: 1,
      username: "testuser",
      rol: "ADMIN",
    });
    expect(res.body.usuario.password_hash).toBeUndefined();
  });
});
