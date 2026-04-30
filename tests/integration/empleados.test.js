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

describe("Empleados - autorizacion", () => {
  it("GET /api/empleados sin token responde 401", async () => {
    const res = await request(app).get("/api/empleados");
    expect(res.status).toBe(401);
  });

  it("OPERADOR no puede crear empleados", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "OPERADOR" }));

    const res = await request(app)
      .post("/api/empleados")
      .set("Authorization", auth)
      .send({ nombre_completo: "Tecnico Uno" });

    expect(res.status).toBe(403);
  });
});

describe("GET /api/empleados", () => {
  it("lista tecnicos con filtros", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));

    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id_empleado: 10,
            id_cuadrilla: 2,
            cuadrilla: "Equipo Norte",
            nombre_completo: "Maria Lopez",
            especialidad: "Jardineria",
            horas_trabajo_dia: "8.00",
            pago_diario: "45.50",
            estado: "ACTIVO",
          },
        ],
      });

    const res = await request(app)
      .get("/api/empleados?estado=ACTIVO&id_cuadrilla=2&busqueda=Maria")
      .set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 50, total: 1 });
    expect(res.body.data[0]).toMatchObject({
      id_empleado: 10,
      cuadrilla: "Equipo Norte",
      nombre_completo: "Maria Lopez",
      horas_trabajo_dia: 8,
      pago_diario: 45.5,
      pago_semanal_estimado: 318.5,
    });

    const countCall = poolMock.query.mock.calls[1];
    expect(countCall[1]).toEqual(["ACTIVO", "2", "%Maria%"]);
  });

  it("rechaza estado invalido", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .get("/api/empleados?estado=FANTASMA")
      .set("Authorization", auth);

    expect(res.status).toBe(400);
  });

  it("incluye carga por fecha cuando se consulta disponibilidad", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));

    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id_empleado: 10,
            nombre_completo: "Maria Lopez",
            ordenes_fecha_count: 1,
            programaciones_fecha_count: 1,
          },
        ],
      });

    const res = await request(app)
      .get("/api/empleados?fecha=2026-05-08")
      .set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      ordenes_fecha_count: 1,
      programaciones_fecha_count: 1,
      carga_fecha_total: 2,
      disponible_fecha: false,
    });
  });
});

describe("POST /api/empleados", () => {
  it("valida nombre obligatorio", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .post("/api/empleados")
      .set("Authorization", auth)
      .send({ id_cuadrilla: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nombre/i);
  });

  it("crea tecnico asignado a cuadrilla activa y registra auditoria", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ id_usuario: 4, rol: "SUPERVISOR" }));

    poolMock.query
      .mockResolvedValueOnce({
        rows: [{ id_cuadrilla: 2, nombre: "Equipo Norte", estado: "ACTIVA" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id_empleado: 11,
            id_cuadrilla: 2,
            nombre_completo: "Maria Lopez",
            horas_trabajo_dia: "8.00",
            pago_diario: "50.00",
            estado: "ACTIVO",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/empleados")
      .set("Authorization", auth)
      .send({
        id_cuadrilla: 2,
        nombre_completo: "Maria Lopez",
        especialidad: "Jardineria",
        horas_trabajo_dia: 8,
        pago_diario: 50,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id_empleado: 11,
      id_cuadrilla: 2,
      nombre_completo: "Maria Lopez",
      horas_trabajo_dia: 8,
      pago_diario: 50,
      pago_semanal_estimado: 350,
    });

    const auditCall = poolMock.query.mock.calls.find((call) =>
      /INSERT INTO auditoria_eventos/i.test(String(call[0]))
    );
    expect(auditCall[1][0]).toBe("empleados");
    expect(auditCall[1][2]).toBe("CREAR");
  });

  it("rechaza horas o pago diario negativos", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .post("/api/empleados")
      .set("Authorization", auth)
      .send({
        nombre_completo: "Maria Lopez",
        horas_trabajo_dia: -1,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/horas/i);
  });
});

describe("PUT/PATCH /api/empleados", () => {
  it("404 si el empleado no existe al actualizar", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put("/api/empleados/77")
      .set("Authorization", auth)
      .send({ nombre_completo: "Fantasma" });

    expect(res.status).toBe(404);
  });

  it("cambia estado y registra auditoria", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    poolMock.query
      .mockResolvedValueOnce({
        rows: [{ id_empleado: 10, nombre_completo: "Maria Lopez", estado: "ACTIVO" }],
      })
      .mockResolvedValueOnce({
        rows: [{ id_empleado: 10, nombre_completo: "Maria Lopez", estado: "INACTIVO" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch("/api/empleados/10/estado")
      .set("Authorization", auth)
      .send({ estado: "INACTIVO" });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("INACTIVO");

    const auditCall = poolMock.query.mock.calls.find((call) =>
      /INSERT INTO auditoria_eventos/i.test(String(call[0]))
    );
    expect(auditCall[1][2]).toBe("CAMBIAR_ESTADO");
  });
});
