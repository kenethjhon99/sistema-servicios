import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";

const poolMock = {
  query: vi.fn(),
  on: vi.fn(),
};

vi.mock("../../src/config/db.js", () => ({
  pool: poolMock,
  testDB: vi.fn(),
}));

let app;
let primeAuth, makeUsuario;

beforeAll(async () => {
  app = (await import("../../src/app.js")).default;
  ({ primeAuth, makeUsuario } = await import("../helpers/auth.js"));
});

beforeEach(() => {
  poolMock.query.mockReset();
});

// =============================================================================
// AISLAMIENTO POR ROL
// =============================================================================
describe("Usuarios — aislamiento por rol", () => {
  it("OPERADOR no puede listar usuarios (403)", async () => {
    const operador = makeUsuario({ id_usuario: 5, rol: "OPERADOR" });
    const auth = primeAuth(poolMock, operador);

    const res = await request(app).get("/api/usuarios").set("Authorization", auth);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/permisos/i);
  });

  it("COBRADOR no puede crear usuarios (403)", async () => {
    const cobrador = makeUsuario({ id_usuario: 7, rol: "COBRADOR" });
    const auth = primeAuth(poolMock, cobrador);

    const res = await request(app)
      .post("/api/usuarios")
      .set("Authorization", auth)
      .send({
        nombre: "X",
        username: "x",
        password: "Password123",
        rol: "OPERADOR",
      });

    expect(res.status).toBe(403);
  });

  it("SUPERVISOR no puede resetear password de otro (403)", async () => {
    const supervisor = makeUsuario({ id_usuario: 9, rol: "SUPERVISOR" });
    const auth = primeAuth(poolMock, supervisor);

    const res = await request(app)
      .patch("/api/usuarios/3/reset-password")
      .set("Authorization", auth)
      .send({ password_nueva: "Password123", confirmar_password: "Password123" });

    expect(res.status).toBe(403);
  });
});

// =============================================================================
// CREAR USUARIO — política de password E2E
// =============================================================================
describe("POST /api/usuarios — crear (ADMIN)", () => {
  const adminBase = () => makeUsuario({ rol: "ADMIN" });

  it("rechaza password corta con error específico (400)", async () => {
    const auth = primeAuth(poolMock, adminBase());

    const res = await request(app)
      .post("/api/usuarios")
      .set("Authorization", auth)
      .send({
        nombre: "Pepe",
        username: "pepe",
        password: "abc1",
        rol: "OPERADOR",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/al menos 8/i);
  });

  it("rechaza password sin números (400)", async () => {
    const auth = primeAuth(poolMock, adminBase());

    const res = await request(app)
      .post("/api/usuarios")
      .set("Authorization", auth)
      .send({
        nombre: "Pepe",
        username: "pepe",
        password: "sololetras",
        rol: "OPERADOR",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/letra y un n[uú]mero/i);
  });

  it("rechaza rol inválido (400)", async () => {
    const auth = primeAuth(poolMock, adminBase());

    const res = await request(app)
      .post("/api/usuarios")
      .set("Authorization", auth)
      .send({
        nombre: "Pepe",
        username: "pepe",
        password: "Password123",
        rol: "HACKER",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rol/i);
  });

  it("rechaza nombre vacío (400)", async () => {
    const auth = primeAuth(poolMock, adminBase());

    const res = await request(app)
      .post("/api/usuarios")
      .set("Authorization", auth)
      .send({
        nombre: "   ",
        username: "pepe",
        password: "Password123",
        rol: "OPERADOR",
      });

    expect(res.status).toBe(400);
  });

  it("responde 409 si ya existe username/correo", async () => {
    const auth = primeAuth(poolMock, adminBase());
    poolMock.query.mockResolvedValueOnce({ rows: [{ id_usuario: 99 }] }); // existeUsuario

    const res = await request(app)
      .post("/api/usuarios")
      .set("Authorization", auth)
      .send({
        nombre: "Pepe",
        username: "pepe",
        password: "Password123",
        rol: "OPERADOR",
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/existe/i);
  });

  it("crea usuario con password válida (201) y NO devuelve password_hash", async () => {
    const auth = primeAuth(poolMock, adminBase());

    poolMock.query
      .mockResolvedValueOnce({ rows: [] }) // existeUsuario → no
      .mockResolvedValueOnce({
        rows: [
          {
            id_usuario: 42,
            nombre: "Pepe",
            correo: null,
            telefono: null,
            username: "pepe",
            rol: "OPERADOR",
            estado: "ACTIVO",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: 1,
            updated_by: 1,
          },
        ],
      }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // auditoría

    const res = await request(app)
      .post("/api/usuarios")
      .set("Authorization", auth)
      .send({
        nombre: "Pepe",
        username: "pepe",
        password: "Password123",
        rol: "OPERADOR",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id_usuario: 42,
      username: "pepe",
      rol: "OPERADOR",
    });
    expect(res.body.password_hash).toBeUndefined();

    // Verifica que el password se guardó hasheado
    const insertCall = poolMock.query.mock.calls[2]; // [auth, exists, INSERT, audit] → INSERT en idx 2
    const passwordHashEnviado = insertCall[1][4];
    expect(passwordHashEnviado).not.toBe("Password123");
    expect(passwordHashEnviado.length).toBeGreaterThan(20); // bcrypt hash
  });

  it("registra evento de auditoría CREAR tras crear", async () => {
    const auth = primeAuth(poolMock, adminBase());
    const creado = {
      id_usuario: 50,
      nombre: "X",
      correo: null,
      telefono: null,
      username: "x",
      rol: "OPERADOR",
      estado: "ACTIVO",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 1,
      updated_by: 1,
    };
    poolMock.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [creado] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post("/api/usuarios")
      .set("Authorization", auth)
      .send({ nombre: "X", username: "x", password: "Password123", rol: "OPERADOR" });

    const auditCall = poolMock.query.mock.calls[3];
    expect(auditCall[0]).toMatch(/INSERT INTO auditoria_eventos/i);
    expect(auditCall[1][2]).toBe("CREAR");
  });
});

// =============================================================================
// CAMBIAR ESTADO
// =============================================================================
describe("PATCH /api/usuarios/:id/estado — cambiar estado (ADMIN)", () => {
  it("impide que un admin se inactive a sí mismo (400)", async () => {
    const admin = makeUsuario({ id_usuario: 1, rol: "ADMIN" });
    const auth = primeAuth(poolMock, admin);

    const res = await request(app)
      .patch("/api/usuarios/1/estado")
      .set("Authorization", auth)
      .send({ estado: "INACTIVO" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/propio/i);
  });

  it("permite que un admin se reactive a sí mismo (idempotente, ACTIVO)", async () => {
    const admin = makeUsuario({ id_usuario: 1, rol: "ADMIN" });
    const auth = primeAuth(poolMock, admin);

    const anterior = { ...admin };
    poolMock.query
      .mockResolvedValueOnce({ rows: [anterior] })
      .mockResolvedValueOnce({
        rows: [{ ...admin, estado: "ACTIVO" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch("/api/usuarios/1/estado")
      .set("Authorization", auth)
      .send({ estado: "ACTIVO" });

    expect(res.status).toBe(200);
  });

  it("rechaza estado inválido (400)", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .patch("/api/usuarios/2/estado")
      .set("Authorization", auth)
      .send({ estado: "PENDIENTE" });

    expect(res.status).toBe(400);
  });

  it("responde 404 si el usuario no existe", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch("/api/usuarios/999/estado")
      .set("Authorization", auth)
      .send({ estado: "INACTIVO" });

    expect(res.status).toBe(404);
  });

  it("rechaza id no numérico antes de tocar BD (400)", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .patch("/api/usuarios/abc/estado")
      .set("Authorization", auth)
      .send({ estado: "INACTIVO" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/entero positivo/i);
  });
});

// =============================================================================
// CAMBIAR MI PASSWORD
// =============================================================================
describe("PATCH /api/usuarios/mi/password — auto-cambio", () => {
  const passwordActualPlano = "Vieja12345";
  let usuario;

  beforeEach(async () => {
    usuario = makeUsuario({
      id_usuario: 10,
      rol: "OPERADOR",
    });
    usuario.password_hash = await bcrypt.hash(passwordActualPlano, 4);
  });

  it("rechaza si falta password actual (400)", async () => {
    const auth = primeAuth(poolMock, usuario);

    const res = await request(app)
      .patch("/api/usuarios/mi/password")
      .set("Authorization", auth)
      .send({ password_nueva: "Nueva12345", confirmar_password: "Nueva12345" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/actual/i);
  });

  it("rechaza nueva password débil (400)", async () => {
    const auth = primeAuth(poolMock, usuario);

    const res = await request(app)
      .patch("/api/usuarios/mi/password")
      .set("Authorization", auth)
      .send({
        password_actual: passwordActualPlano,
        password_nueva: "abc",
        confirmar_password: "abc",
      });

    expect(res.status).toBe(400);
  });

  it("rechaza si la confirmación no coincide (400)", async () => {
    const auth = primeAuth(poolMock, usuario);

    const res = await request(app)
      .patch("/api/usuarios/mi/password")
      .set("Authorization", auth)
      .send({
        password_actual: passwordActualPlano,
        password_nueva: "Nueva12345",
        confirmar_password: "Nueva99999",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confirmación|coincide/i);
  });

  it("rechaza si la password actual es incorrecta (400)", async () => {
    const auth = primeAuth(poolMock, usuario);
    poolMock.query.mockResolvedValueOnce({ rows: [usuario] }); // SELECT *

    const res = await request(app)
      .patch("/api/usuarios/mi/password")
      .set("Authorization", auth)
      .send({
        password_actual: "incorrecta",
        password_nueva: "Nueva12345",
        confirmar_password: "Nueva12345",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/incorrecta/i);
  });

  it("rechaza si la nueva password es igual a la actual (400)", async () => {
    const auth = primeAuth(poolMock, usuario);
    poolMock.query.mockResolvedValueOnce({ rows: [usuario] });

    const res = await request(app)
      .patch("/api/usuarios/mi/password")
      .set("Authorization", auth)
      .send({
        password_actual: passwordActualPlano,
        password_nueva: passwordActualPlano,
        confirmar_password: passwordActualPlano,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/igual a la actual/i);
  });

  it("cambia la password con éxito (200) y la guarda hasheada", async () => {
    const auth = primeAuth(poolMock, usuario);
    poolMock.query
      .mockResolvedValueOnce({ rows: [usuario] }) // SELECT *
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const res = await request(app)
      .patch("/api/usuarios/mi/password")
      .set("Authorization", auth)
      .send({
        password_actual: passwordActualPlano,
        password_nueva: "NuevaPwd123",
        confirmar_password: "NuevaPwd123",
      });

    expect(res.status).toBe(200);

    const updateCall = poolMock.query.mock.calls[2]; // [auth, SELECT, UPDATE]
    const nuevoHash = updateCall[1][0];
    expect(nuevoHash).not.toBe("NuevaPwd123");
    const ok = await bcrypt.compare("NuevaPwd123", nuevoHash);
    expect(ok).toBe(true);
  });
});

// =============================================================================
// RESETEAR PASSWORD (ADMIN)
// =============================================================================
describe("PATCH /api/usuarios/:id/reset-password — reset por ADMIN", () => {
  it("rechaza nueva password débil (400)", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .patch("/api/usuarios/3/reset-password")
      .set("Authorization", auth)
      .send({ password_nueva: "abc", confirmar_password: "abc" });

    expect(res.status).toBe(400);
  });

  it("responde 404 si el usuario destino no existe", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [] }); // SELECT id_usuario

    const res = await request(app)
      .patch("/api/usuarios/777/reset-password")
      .set("Authorization", auth)
      .send({ password_nueva: "Password123", confirmar_password: "Password123" });

    expect(res.status).toBe(404);
  });

  it("resetea la password con éxito (200) y registra auditoría RESET_PASSWORD", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ id_usuario: 3, username: "alice" }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // auditoría

    const res = await request(app)
      .patch("/api/usuarios/3/reset-password")
      .set("Authorization", auth)
      .send({ password_nueva: "Password123", confirmar_password: "Password123" });

    expect(res.status).toBe(200);

    const auditCall = poolMock.query.mock.calls[3];
    expect(auditCall[0]).toMatch(/INSERT INTO auditoria_eventos/i);
    expect(auditCall[1][2]).toBe("RESET_PASSWORD");
  });
});

// =============================================================================
// LISTAR USUARIOS — paginación y filtros
// =============================================================================
describe("GET /api/usuarios — listar (ADMIN)", () => {
  it("aplica paginación por defecto (page=1, limit=50)", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] }) // COUNT
      .mockResolvedValueOnce({ rows: [] }); // SELECT

    const res = await request(app).get("/api/usuarios").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 50,
      total: 0,
    });
  });

  it("respeta page y limit del query string", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 75 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/usuarios?page=2&limit=25")
      .set("Authorization", auth);

    expect(res.body.pagination).toMatchObject({
      page: 2,
      limit: 25,
      total: 75,
      total_pages: 3,
    });

    // Verifica que el OFFSET es (page-1)*limit = 25
    const dataCall = poolMock.query.mock.calls[2]; // [auth, COUNT, SELECT]
    const limitArg = dataCall[1][dataCall[1].length - 2];
    const offsetArg = dataCall[1][dataCall[1].length - 1];
    expect(limitArg).toBe(25);
    expect(offsetArg).toBe(25);
  });
});
