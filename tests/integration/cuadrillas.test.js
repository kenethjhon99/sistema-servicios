import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";

const clientMock = {
  query: vi.fn(),
  release: vi.fn(),
};

const poolMock = {
  query: vi.fn(),
  connect: vi.fn().mockResolvedValue(clientMock),
  on: vi.fn(),
};

vi.mock("../../src/config/db.js", () => ({
  pool: poolMock,
  testDB: vi.fn(),
}));

let app;
let primeAuth;
let makeUsuario;

beforeAll(async () => {
  app = (await import("../../src/app.js")).default;
  ({ primeAuth, makeUsuario } = await import("../helpers/auth.js"));
});

beforeEach(() => {
  poolMock.query.mockReset();
  clientMock.query.mockReset();
  clientMock.release.mockReset();
  poolMock.connect.mockReset();
  poolMock.connect.mockResolvedValue(clientMock);
});

describe("Cuadrillas - autorizacion", () => {
  it("GET /api/cuadrillas sin token responde 401", async () => {
    const res = await request(app).get("/api/cuadrillas");
    expect(res.status).toBe(401);
  });

  it("OPERADOR no puede crear cuadrillas", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "OPERADOR" }));

    const res = await request(app)
      .post("/api/cuadrillas")
      .set("Authorization", auth)
      .send({ nombre: "Equipo Norte" });

    expect(res.status).toBe(403);
  });
});

describe("GET /api/cuadrillas", () => {
  it("lista cuadrillas con paginacion y filtros", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));

    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id_cuadrilla: 3,
            nombre: "Equipo Norte",
            descripcion: "Servicios de campo",
            estado: "ACTIVA",
            total_empleados: 4,
            empleados_activos: 3,
          },
        ],
      });

    const res = await request(app)
      .get("/api/cuadrillas?estado=ACTIVA&busqueda=Norte")
      .set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 50, total: 1 });
    expect(res.body.data[0]).toMatchObject({
      id_cuadrilla: 3,
      nombre: "Equipo Norte",
      estado: "ACTIVA",
      total_empleados: 4,
      empleados_activos: 3,
    });

    const countCall = poolMock.query.mock.calls[1];
    expect(countCall[1]).toEqual(["ACTIVA", "%Norte%"]);
  });

  it("rechaza estado invalido", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .get("/api/cuadrillas?estado=FANTASMA")
      .set("Authorization", auth);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ACTIVA o INACTIVA/i);
  });
});

describe("POST /api/cuadrillas", () => {
  it("valida nombre obligatorio", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .post("/api/cuadrillas")
      .set("Authorization", auth)
      .send({ descripcion: "Sin nombre" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nombre/i);
  });

  it("crea cuadrilla y registra auditoria", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ id_usuario: 9, rol: "SUPERVISOR" }));

    poolMock.query
      .mockResolvedValueOnce({
        rows: [
          {
            id_cuadrilla: 7,
            nombre: "Equipo Centro",
            descripcion: "Cobertura urbana",
            estado: "ACTIVA",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/cuadrillas")
      .set("Authorization", auth)
      .send({ nombre: "Equipo Centro", descripcion: "Cobertura urbana" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id_cuadrilla: 7,
      nombre: "Equipo Centro",
      estado: "ACTIVA",
    });

    const auditCall = poolMock.query.mock.calls.find((call) =>
      /INSERT INTO auditoria_eventos/i.test(String(call[0]))
    );
    expect(auditCall[1][0]).toBe("cuadrillas");
    expect(auditCall[1][2]).toBe("CREAR");
  });
});

describe("PUT /api/cuadrillas/:id y PATCH /api/cuadrillas/:id/estado", () => {
  it("devuelve 404 al actualizar una cuadrilla inexistente", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/api/cuadrillas/99")
      .set("Authorization", auth)
      .send({ nombre: "Equipo Fantasma" });

    expect(res.status).toBe(404);
  });

  it("cambia estado y registra auditoria", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ id_usuario: 2, rol: "ADMIN" }));

    poolMock.query
      .mockResolvedValueOnce({
        rows: [
          {
            id_cuadrilla: 5,
            nombre: "Equipo Sur",
            estado: "ACTIVA",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id_cuadrilla: 5,
            nombre: "Equipo Sur",
            estado: "INACTIVA",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch("/api/cuadrillas/5/estado")
      .set("Authorization", auth)
      .send({ estado: "INACTIVA" });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("INACTIVA");

    const auditCall = poolMock.query.mock.calls.find((call) =>
      /INSERT INTO auditoria_eventos/i.test(String(call[0]))
    );
    expect(auditCall[1][2]).toBe("CAMBIAR_ESTADO");
  });
});
