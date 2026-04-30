import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";

const poolMock = {
  query: vi.fn(),
  connect: vi.fn(),
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
  poolMock.connect.mockReset();
});

describe("Programaciones - tecnico responsable", () => {
  it("crea programacion con tecnico responsable valido", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));

    poolMock.query
      .mockResolvedValueOnce({ rows: [{ id_cliente: 1, estado: "ACTIVO" }] })
      .mockResolvedValueOnce({ rows: [{ id_propiedad: 3, id_cliente: 1, estado: "ACTIVA" }] })
      .mockResolvedValueOnce({ rows: [{ id_servicio: 8, estado: "ACTIVO" }] })
      .mockResolvedValueOnce({ rows: [{ id_cuadrilla: 12, estado: "ACTIVA" }] })
      .mockResolvedValueOnce({
        rows: [{ id_empleado: 20, id_cuadrilla: 12, estado: "ACTIVO" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id_programacion: 50, id_empleado_responsable: 20, id_cuadrilla: 12 }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/programaciones")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_propiedad: 3,
        id_servicio: 8,
        id_cuadrilla: 12,
        id_empleado_responsable: 20,
        frecuencia: "SEMANAL",
        fecha_inicio: "2026-05-01",
        proxima_fecha: "2026-05-08",
        duracion_estimada_min: 60,
        precio_acordado: 250,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id_programacion: 50,
      id_empleado_responsable: 20,
    });
  });

  it("rechaza tecnico responsable de otra cuadrilla", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));

    poolMock.query
      .mockResolvedValueOnce({ rows: [{ id_cliente: 1, estado: "ACTIVO" }] })
      .mockResolvedValueOnce({ rows: [{ id_propiedad: 3, id_cliente: 1, estado: "ACTIVA" }] })
      .mockResolvedValueOnce({ rows: [{ id_servicio: 8, estado: "ACTIVO" }] })
      .mockResolvedValueOnce({ rows: [{ id_cuadrilla: 12, estado: "ACTIVA" }] })
      .mockResolvedValueOnce({
        rows: [{ id_empleado: 20, id_cuadrilla: 99, estado: "ACTIVO" }],
      });

    const res = await request(app)
      .post("/api/programaciones")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_propiedad: 3,
        id_servicio: 8,
        id_cuadrilla: 12,
        id_empleado_responsable: 20,
        frecuencia: "SEMANAL",
        fecha_inicio: "2026-05-01",
        proxima_fecha: "2026-05-08",
        duracion_estimada_min: 60,
        precio_acordado: 250,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no pertenece a la cuadrilla/i);
  });

  it("rechaza tecnico responsable con sobreasignacion en la misma fecha", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));

    poolMock.query
      .mockResolvedValueOnce({ rows: [{ id_cliente: 1, estado: "ACTIVO" }] })
      .mockResolvedValueOnce({ rows: [{ id_propiedad: 3, id_cliente: 1, estado: "ACTIVA" }] })
      .mockResolvedValueOnce({ rows: [{ id_servicio: 8, estado: "ACTIVO" }] })
      .mockResolvedValueOnce({ rows: [{ id_cuadrilla: 12, estado: "ACTIVA" }] })
      .mockResolvedValueOnce({
        rows: [{ id_empleado: 20, id_cuadrilla: 12, estado: "ACTIVO" }],
      })
      .mockResolvedValueOnce({
        rows: [{ id_programacion: 999 }],
      });

    const res = await request(app)
      .post("/api/programaciones")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_propiedad: 3,
        id_servicio: 8,
        id_cuadrilla: 12,
        id_empleado_responsable: 20,
        frecuencia: "SEMANAL",
        fecha_inicio: "2026-05-01",
        proxima_fecha: "2026-05-08",
        duracion_estimada_min: 60,
        precio_acordado: 250,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ya tiene una programacion activa/i);
  });
});
