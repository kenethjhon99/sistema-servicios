import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const makeTxClient = () => ({
  query: vi.fn(),
  release: vi.fn(),
});

beforeAll(async () => {
  app = (await import("../../src/app.js")).default;
  ({ primeAuth, makeUsuario } = await import("../helpers/auth.js"));
});

beforeEach(() => {
  poolMock.query.mockReset();
  poolMock.connect.mockReset();
});

describe("Programaciones ejecuciones", () => {
  it("lista ejecuciones de una programacion existente", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));

    poolMock.query
      .mockResolvedValueOnce({
        rows: [{ id_programacion: 9, proxima_fecha: "2026-05-20", hora_programada: "08:00:00" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id_ejecucion: 11,
            id_programacion: 9,
            fecha_programada: "2026-05-20",
            fecha_reprogramada: null,
            hora_programada: "08:00:00",
            estado: "PENDIENTE",
            motivo_reprogramacion: null,
            motivo_cancelacion: null,
            id_orden_trabajo: null,
            fecha_generacion_orden: null,
            fecha_cierre: null,
            resultado: null,
            observaciones: null,
          },
        ],
      });

    const res = await request(app)
      .get("/api/programaciones/9/ejecuciones")
      .set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id_ejecucion: 11,
      estado: "PENDIENTE",
    });
  });

  it("devuelve 404 si la programacion no existe al listar ejecuciones", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));

    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/programaciones/999/ejecuciones")
      .set("Authorization", auth);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/programaci[oó]n no encontrada|schedule not found/i);
  });

  it("genera una ejecucion usando la proxima fecha", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));
    const client = makeTxClient();

    poolMock.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{ id_programacion: 5, proxima_fecha: "2026-05-20", hora_programada: "08:00:00", estado: "ACTIVA" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id_ejecucion: 21,
            id_programacion: 5,
            fecha_programada: "2026-05-20",
            fecha_reprogramada: null,
            hora_programada: "08:00:00",
            estado: "PENDIENTE",
            motivo_reprogramacion: null,
            motivo_cancelacion: null,
            id_orden_trabajo: null,
            fecha_generacion_orden: null,
            fecha_cierre: null,
            resultado: null,
            observaciones: null,
          },
        ],
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post("/api/programaciones/5/ejecuciones/generar")
      .set("Authorization", auth)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id_ejecucion: 21,
      fecha_programada: "2026-05-20",
      estado: "PENDIENTE",
    });
  });

  it("rechaza generacion duplicada para la misma fecha", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));
    const client = makeTxClient();

    poolMock.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{ id_programacion: 5, proxima_fecha: "2026-05-20", hora_programada: "08:00:00", estado: "ACTIVA" }],
      })
      .mockResolvedValueOnce({ rows: [{ id_ejecucion: 33 }] })
      .mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post("/api/programaciones/5/ejecuciones/generar")
      .set("Authorization", auth)
      .send({ fecha_programada: "2026-05-20" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ya existe una visita pendiente o generada/i);
  });

  it("reprograma una ejecucion y crea una nueva pendiente", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));
    const client = makeTxClient();

    poolMock.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            id_ejecucion: 40,
            id_programacion: 7,
            fecha_programada: "2026-05-20",
            hora_programada: "08:00:00",
            hora_programada_base: "08:00:00",
            estado: "PENDIENTE",
            estado_programacion: "ACTIVA",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id_ejecucion: 40,
            id_programacion: 7,
            fecha_programada: "2026-05-20",
            fecha_reprogramada: "2026-05-22",
            hora_programada: "08:00:00",
            estado: "REPROGRAMADA",
            motivo_reprogramacion: "Cliente solicito cambio",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id_ejecucion: 41,
            id_programacion: 7,
            fecha_programada: "2026-05-22",
            fecha_reprogramada: null,
            hora_programada: "10:30:00",
            estado: "PENDIENTE",
            observaciones: "Mover por acceso restringido",
          },
        ],
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post("/api/programaciones/ejecuciones/40/reprogramar")
      .set("Authorization", auth)
      .send({
        nueva_fecha: "2026-05-22",
        nueva_hora: "10:30:00",
        motivo_reprogramacion: "Cliente solicito cambio",
        observaciones: "Mover por acceso restringido",
      });

    expect(res.status).toBe(200);
    expect(res.body.anterior).toMatchObject({
      id_ejecucion: 40,
      estado: "REPROGRAMADA",
    });
    expect(res.body.nueva).toMatchObject({
      id_ejecucion: 41,
      estado: "PENDIENTE",
      fecha_programada: "2026-05-22",
    });
  });

  it("rechaza reprogramacion sin nueva fecha o sin motivo", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));
    const client = makeTxClient();

    poolMock.connect.mockResolvedValue(client);

    const missingDate = await request(app)
      .post("/api/programaciones/ejecuciones/40/reprogramar")
      .set("Authorization", auth)
      .send({ motivo_reprogramacion: "Mover" });

    expect(missingDate.status).toBe(400);

    poolMock.query.mockResolvedValueOnce({ rows: [makeUsuario({ rol: "SUPERVISOR" })] });

    const missingReason = await request(app)
      .post("/api/programaciones/ejecuciones/40/reprogramar")
      .set("Authorization", auth)
      .send({ nueva_fecha: "2026-05-22" });

    expect(missingReason.status).toBe(400);
  });

  it("cancela una ejecucion con motivo", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));
    const client = makeTxClient();

    poolMock.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            id_ejecucion: 50,
            id_programacion: 9,
            fecha_programada: "2026-05-25",
            estado: "PENDIENTE",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id_ejecucion: 50,
            id_programacion: 9,
            fecha_programada: "2026-05-25",
            estado: "CANCELADA",
            motivo_cancelacion: "Cliente no disponible",
          },
        ],
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post("/api/programaciones/ejecuciones/50/cancelar")
      .set("Authorization", auth)
      .send({ motivo_cancelacion: "Cliente no disponible" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id_ejecucion: 50,
      estado: "CANCELADA",
    });
  });

  it("rechaza cancelacion sin motivo", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));
    const client = makeTxClient();

    poolMock.connect.mockResolvedValue(client);

    const res = await request(app)
      .post("/api/programaciones/ejecuciones/50/cancelar")
      .set("Authorization", auth)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/motivo de cancelaci[oó]n/i);
  });

  it("devuelve 404 si la ejecucion no existe", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));
    const client = makeTxClient();

    poolMock.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post("/api/programaciones/ejecuciones/999/cancelar")
      .set("Authorization", auth)
      .send({ motivo_cancelacion: "No aplica" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/visita programada no encontrada|scheduled visit not found/i);
  });

  it("genera una orden desde una ejecucion pendiente", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));
    const client = makeTxClient();

    poolMock.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            id_ejecucion: 80,
            id_programacion: 12,
            fecha_programada: "2026-05-21",
            hora_programada: "08:30:00",
            estado: "PENDIENTE",
            id_orden_trabajo: null,
            id_cliente: 3,
            id_propiedad: 4,
            id_servicio: 9,
            id_cuadrilla: null,
            frecuencia: "SEMANAL",
            proxima_fecha: "2026-05-21",
            hora_programada_base: "08:30:00",
            duracion_estimada_min: 90,
            precio_acordado: 250,
            descripcion_precio: "Mantenimiento semanal",
            observaciones_programacion: "Llevar equipo base",
            estado_programacion: "ACTIVA",
            id_empleado_responsable: 17,
            servicio: "Mantenimiento",
            estado_empleado_responsable: "ACTIVO",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id_orden_trabajo: 501,
            numero_orden: "OT-20260511-101010",
            fecha_servicio: "2026-05-21",
            subtotal: 0,
            total_orden: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id_orden_trabajo: 501,
            numero_orden: "OT-20260511-101010",
            fecha_servicio: "2026-05-21",
            subtotal: 250,
            total_orden: 250,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id_ejecucion: 80,
            id_programacion: 12,
            fecha_programada: "2026-05-21",
            estado: "GENERADA",
            id_orden_trabajo: 501,
          },
        ],
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post("/api/programaciones/ejecuciones/80/generar-orden")
      .set("Authorization", auth)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id_orden_trabajo: 501,
      subtotal: 250,
      total_orden: 250,
    });
  });
});
