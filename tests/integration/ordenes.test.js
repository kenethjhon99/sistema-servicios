import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";

/**
 * Mock del módulo db.js. El pool soporta tanto query() como connect()
 * (este último devuelve un client transaccional con su propio query/release).
 */
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
let primeAuth, makeUsuario;

beforeAll(async () => {
  app = (await import("../../src/app.js")).default;
  ({ primeAuth, makeUsuario } = await import("../helpers/auth.js"));
});

beforeEach(() => {
  poolMock.query.mockReset();
  clientMock.query.mockReset();
  clientMock.release.mockReset();
  // Reset connect() para asegurar que sigue devolviendo el client
  poolMock.connect.mockReset();
  poolMock.connect.mockResolvedValue(clientMock);
});

/**
 * Helper: ceba BEGIN/COMMIT/ROLLBACK como no-ops.
 * Cualquier otra respuesta debe encolarse explícitamente con mockResolvedValueOnce.
 */
const primeTx = () => {
  clientMock.query.mockImplementation((sql) => {
    const txt = String(sql).trim().toUpperCase();
    if (txt === "BEGIN" || txt === "COMMIT" || txt === "ROLLBACK") {
      return Promise.resolve({ rows: [] });
    }
    // Para que mockResolvedValueOnce(...) tenga prioridad, llamamos al
    // implementation por defecto sólo cuando no hay nada encolado:
    return Promise.resolve({ rows: [] });
  });
};

// =============================================================================
// AUTORIZACIÓN
// =============================================================================
describe("Órdenes de trabajo — autorización", () => {
  it("GET /api/ordenes sin token → 401", async () => {
    const res = await request(app).get("/api/ordenes");
    expect(res.status).toBe(401);
  });

  it("COBRADOR no puede crear orden (403)", async () => {
    const cobrador = makeUsuario({ id_usuario: 7, rol: "COBRADOR" });
    const auth = primeAuth(poolMock, cobrador);

    const res = await request(app)
      .post("/api/ordenes")
      .set("Authorization", auth)
      .send({});

    expect(res.status).toBe(403);
  });

  it("OPERADOR no puede cambiar estado de orden (403)", async () => {
    const operador = makeUsuario({ id_usuario: 5, rol: "OPERADOR" });
    const auth = primeAuth(poolMock, operador);

    const res = await request(app)
      .patch("/api/ordenes/1/estado")
      .set("Authorization", auth)
      .send({ estado: "COMPLETADA" });

    expect(res.status).toBe(403);
  });
});

// =============================================================================
// CREAR ORDEN — VALIDACIONES
// =============================================================================
describe("POST /api/ordenes — validaciones de body", () => {
  const supervisor = () => makeUsuario({ id_usuario: 1, rol: "SUPERVISOR" });

  beforeEach(() => primeTx());

  it("rechaza sin id_cliente (400) y hace ROLLBACK", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .post("/api/ordenes")
      .set("Authorization", auth)
      .send({ id_propiedad: 1, fecha_servicio: "2026-04-25", detalles: [{}] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cliente/i);
    // Verifica que se llamó BEGIN y ROLLBACK
    const sqls = clientMock.query.mock.calls.map((c) => String(c[0]).trim().toUpperCase());
    expect(sqls).toContain("BEGIN");
    expect(sqls).toContain("ROLLBACK");
    expect(clientMock.release).toHaveBeenCalled();
  });

  it("rechaza sin detalles (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .post("/api/ordenes")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_propiedad: 1,
        fecha_servicio: "2026-04-25",
        detalles: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/detalle/i);
  });

  it("rechaza tipo_visita inválido (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .post("/api/ordenes")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_propiedad: 1,
        fecha_servicio: "2026-04-25",
        tipo_visita: "FANTASMA",
        detalles: [{ id_servicio: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tipo de visita/i);
  });

  it("rechaza descuento negativo (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .post("/api/ordenes")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_propiedad: 1,
        fecha_servicio: "2026-04-25",
        descuento: -100,
        detalles: [{ id_servicio: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/descuento/i);
  });
});

// =============================================================================
// CREAR ORDEN — REGLAS DE NEGOCIO E INTEGRIDAD
// =============================================================================
describe("POST /api/ordenes — integridad referencial y negocio", () => {
  const supervisor = () => makeUsuario({ id_usuario: 1, rol: "SUPERVISOR" });

  beforeEach(() => primeTx());

  /**
   * Helper para encadenar respuestas del client en orden.
   * Las llamadas a BEGIN/COMMIT/ROLLBACK pasan por la implementación por defecto.
   */
  const seedClientResponses = (responses) => {
    let i = 0;
    clientMock.query.mockImplementation((sql) => {
      const txt = String(sql).trim().toUpperCase();
      if (txt === "BEGIN" || txt === "COMMIT" || txt === "ROLLBACK") {
        return Promise.resolve({ rows: [] });
      }
      const r = responses[i] ?? { rows: [] };
      i++;
      return Promise.resolve(r);
    });
  };

  it("404 si el cliente no existe", async () => {
    const auth = primeAuth(poolMock, supervisor());
    seedClientResponses([{ rows: [] }]); // SELECT cliente → vacío

    const res = await request(app)
      .post("/api/ordenes")
      .set("Authorization", auth)
      .send({
        id_cliente: 999,
        id_propiedad: 1,
        fecha_servicio: "2026-04-25",
        detalles: [{ id_servicio: 1 }],
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/cliente.*no existe/i);
  });

  it("400 si el cliente está INACTIVO", async () => {
    const auth = primeAuth(poolMock, supervisor());
    seedClientResponses([
      { rows: [{ id_cliente: 1, estado: "INACTIVO" }] },
    ]);

    const res = await request(app)
      .post("/api/ordenes")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_propiedad: 1,
        fecha_servicio: "2026-04-25",
        detalles: [{ id_servicio: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inactivo/i);
  });

  it("400 si la propiedad no pertenece al cliente", async () => {
    const auth = primeAuth(poolMock, supervisor());
    seedClientResponses([
      { rows: [{ id_cliente: 1, estado: "ACTIVO" }] },
      { rows: [{ id_propiedad: 2, id_cliente: 99, estado: "ACTIVA" }] },
    ]);

    const res = await request(app)
      .post("/api/ordenes")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_propiedad: 2,
        fecha_servicio: "2026-04-25",
        detalles: [{ id_servicio: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no pertenece al cliente/i);
  });

  it("crea orden completa, calcula subtotal, total y registra auditoría (201)", async () => {
    const auth = primeAuth(poolMock, supervisor());
    const ordenInsertada = {
      id_orden_trabajo: 100,
      numero_orden: "OT-20260424-120000",
      id_cliente: 1,
      id_propiedad: 2,
    };
    const ordenFinal = {
      ...ordenInsertada,
      subtotal: 200,
      total_orden: 180,
      descuento: 20,
    };

    seedClientResponses([
      { rows: [{ id_cliente: 1, estado: "ACTIVO" }] }, // SELECT cliente
      { rows: [{ id_propiedad: 2, id_cliente: 1, estado: "ACTIVA" }] }, // SELECT propiedad
      { rows: [ordenInsertada] }, // INSERT orden
      { rows: [{ id_servicio: 7, estado: "ACTIVO" }] }, // SELECT servicio
      { rows: [] }, // INSERT detalle
      { rows: [{ subtotal: 200 }] }, // recalcularTotales: SUM subtotal
      { rows: [ordenFinal] }, // recalcularTotales: UPDATE orden
      { rows: [] }, // INSERT auditoría
    ]);

    const res = await request(app)
      .post("/api/ordenes")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_propiedad: 2,
        fecha_servicio: "2026-04-25",
        descuento: 20,
        detalles: [
          { id_servicio: 7, cantidad: 2, precio_unitario: 100 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id_orden_trabajo: 100,
      subtotal: 200,
      total_orden: 180,
    });

    // COMMIT debe haber sido llamado
    const sqls = clientMock.query.mock.calls.map((c) => String(c[0]).trim().toUpperCase());
    expect(sqls).toContain("COMMIT");
    expect(sqls).not.toContain("ROLLBACK");
    expect(clientMock.release).toHaveBeenCalled();

    // Verifica subtotal calculado en INSERT detalle (cantidad * precio_unitario = 200)
    const insertDetalleCall = clientMock.query.mock.calls.find((c) =>
      /INSERT INTO ordenes_trabajo_detalle/i.test(String(c[0]))
    );
    expect(insertDetalleCall).toBeDefined();
    const subtotalArg = insertDetalleCall[1][7];
    expect(subtotalArg).toBe(200);
  });

  it("ROLLBACK si un detalle tiene cantidad <= 0", async () => {
    const auth = primeAuth(poolMock, supervisor());
    seedClientResponses([
      { rows: [{ id_cliente: 1, estado: "ACTIVO" }] },
      { rows: [{ id_propiedad: 2, id_cliente: 1, estado: "ACTIVA" }] },
      { rows: [{ id_orden_trabajo: 100 }] }, // INSERT orden
    ]);

    const res = await request(app)
      .post("/api/ordenes")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_propiedad: 2,
        fecha_servicio: "2026-04-25",
        detalles: [{ id_servicio: 7, cantidad: 0, precio_unitario: 100 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cantidad/i);
    const sqls = clientMock.query.mock.calls.map((c) => String(c[0]).trim().toUpperCase());
    expect(sqls).toContain("ROLLBACK");
  });
});

// =============================================================================
// CAMBIAR ESTADO
// =============================================================================
describe("PATCH /api/ordenes/:id/estado", () => {
  const supervisor = () => makeUsuario({ id_usuario: 1, rol: "SUPERVISOR" });

  beforeEach(() => primeTx());

  it("rechaza estado inválido (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .patch("/api/ordenes/1/estado")
      .set("Authorization", auth)
      .send({ estado: "FANTASMA" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/estado/i);
  });

  it("exige motivo cuando se cancela (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .patch("/api/ordenes/1/estado")
      .set("Authorization", auth)
      .send({ estado: "CANCELADA" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/motivo/i);
  });

  it("404 si la orden no existe", async () => {
    const auth = primeAuth(poolMock, supervisor());
    let i = 0;
    const responses = [{ rows: [] }]; // SELECT orden anterior → vacía
    clientMock.query.mockImplementation((sql) => {
      const txt = String(sql).trim().toUpperCase();
      if (txt === "BEGIN" || txt === "COMMIT" || txt === "ROLLBACK") {
        return Promise.resolve({ rows: [] });
      }
      const r = responses[i] ?? { rows: [] };
      i++;
      return Promise.resolve(r);
    });

    const res = await request(app)
      .patch("/api/ordenes/999/estado")
      .set("Authorization", auth)
      .send({ estado: "EN_PROCESO" });

    expect(res.status).toBe(404);
  });

  it("cambia estado y registra auditoría CAMBIAR_ESTADO (200)", async () => {
    const auth = primeAuth(poolMock, supervisor());
    const ordenAnterior = { id_orden_trabajo: 1, numero_orden: "OT-X", estado: "PENDIENTE" };
    const ordenNueva = { ...ordenAnterior, estado: "EN_PROCESO" };

    let i = 0;
    const responses = [
      { rows: [ordenAnterior] }, // SELECT
      { rows: [ordenNueva] }, // UPDATE
      { rows: [] }, // INSERT auditoría
    ];
    clientMock.query.mockImplementation((sql) => {
      const txt = String(sql).trim().toUpperCase();
      if (txt === "BEGIN" || txt === "COMMIT" || txt === "ROLLBACK") {
        return Promise.resolve({ rows: [] });
      }
      const r = responses[i] ?? { rows: [] };
      i++;
      return Promise.resolve(r);
    });

    const res = await request(app)
      .patch("/api/ordenes/1/estado")
      .set("Authorization", auth)
      .send({ estado: "EN_PROCESO" });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("EN_PROCESO");

    const auditCall = clientMock.query.mock.calls.find((c) =>
      /INSERT INTO auditoria_eventos/i.test(String(c[0]))
    );
    expect(auditCall).toBeDefined();
    expect(auditCall[1][2]).toBe("CAMBIAR_ESTADO");
  });

  it("cancela orden y registra auditoría CANCELAR (no CAMBIAR_ESTADO)", async () => {
    const auth = primeAuth(poolMock, supervisor());
    const ordenAnterior = { id_orden_trabajo: 1, numero_orden: "OT-X", estado: "PENDIENTE" };
    const ordenNueva = { ...ordenAnterior, estado: "CANCELADA" };

    let i = 0;
    const responses = [
      { rows: [ordenAnterior] },
      { rows: [ordenNueva] },
      { rows: [] },
    ];
    clientMock.query.mockImplementation((sql) => {
      const txt = String(sql).trim().toUpperCase();
      if (txt === "BEGIN" || txt === "COMMIT" || txt === "ROLLBACK") {
        return Promise.resolve({ rows: [] });
      }
      const r = responses[i] ?? { rows: [] };
      i++;
      return Promise.resolve(r);
    });

    const res = await request(app)
      .patch("/api/ordenes/1/estado")
      .set("Authorization", auth)
      .send({
        estado: "CANCELADA",
        motivo_cancelacion: "Cliente reagenda",
      });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("CANCELADA");

    const auditCall = clientMock.query.mock.calls.find((c) =>
      /INSERT INTO auditoria_eventos/i.test(String(c[0]))
    );
    expect(auditCall[1][2]).toBe("CANCELAR");
  });

  it("rechaza id no numérico (400) sin tocar BD", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .patch("/api/ordenes/abc/estado")
      .set("Authorization", auth)
      .send({ estado: "EN_PROCESO" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/entero positivo/i);
    // No se debe haber abierto transacción
    expect(poolMock.connect).not.toHaveBeenCalled();
  });
});

// =============================================================================
// LISTAR
// =============================================================================
describe("GET /api/ordenes — listar", () => {
  it("paginación por defecto", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "OPERADOR" }));
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get("/api/ordenes").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 50, total: 0 });
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("aplica filtros estado e id_cliente al WHERE", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "OPERADOR" }));
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get("/api/ordenes?estado=pendiente&id_cliente=42")
      .set("Authorization", auth);

    const countCall = poolMock.query.mock.calls[1]; // [auth, COUNT, SELECT]
    expect(countCall[0]).toMatch(/ot\.estado = \$1/i);
    expect(countCall[0]).toMatch(/ot\.id_cliente = \$2/i);
    expect(countCall[1]).toEqual(["PENDIENTE", "42"]);
  });
});
