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
let primeAuth, makeUsuario;

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

/**
 * Encadena respuestas en clientMock.query, dejando BEGIN/COMMIT/ROLLBACK como no-ops.
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

// =============================================================================
// AUTORIZACIÓN
// =============================================================================
describe("Pagos / créditos — autorización por rol", () => {
  it("OPERADOR no puede crear pago (403)", async () => {
    const operador = makeUsuario({ id_usuario: 5, rol: "OPERADOR" });
    const auth = primeAuth(poolMock, operador);

    const res = await request(app)
      .post("/api/pagos")
      .set("Authorization", auth)
      .send({});

    expect(res.status).toBe(403);
  });

  it("COBRADOR no puede crear créditos (403)", async () => {
    const cobrador = makeUsuario({ id_usuario: 7, rol: "COBRADOR" });
    const auth = primeAuth(poolMock, cobrador);

    const res = await request(app)
      .post("/api/pagos/creditos")
      .set("Authorization", auth)
      .send({});

    expect(res.status).toBe(403);
  });

  it("SUPERVISOR no puede cancelar créditos (sólo ADMIN) → 403", async () => {
    const supervisor = makeUsuario({ id_usuario: 9, rol: "SUPERVISOR" });
    const auth = primeAuth(poolMock, supervisor);

    const res = await request(app)
      .patch("/api/pagos/creditos/1/estado")
      .set("Authorization", auth)
      .send({ estado: "CANCELADO" });

    expect(res.status).toBe(403);
  });

  it("COBRADOR sí puede aplicar pago a crédito (no 403)", async () => {
    const cobrador = makeUsuario({ id_usuario: 7, rol: "COBRADOR" });
    const auth = primeAuth(poolMock, cobrador);

    // Mandamos body vacío → caerá en validación 400, pero la pre-validación
    // de rol debería pasar. Lo importante es que no responda 403.
    const res = await request(app)
      .post("/api/pagos/creditos/aplicar-pago")
      .set("Authorization", auth)
      .send({});

    expect(res.status).not.toBe(403);
  });
});

// =============================================================================
// CREAR PAGO
// =============================================================================
describe("POST /api/pagos — registrar pago suelto", () => {
  const cobrador = () => makeUsuario({ id_usuario: 7, rol: "COBRADOR" });

  it("rechaza monto <= 0 (400)", async () => {
    const auth = primeAuth(poolMock, cobrador());

    const res = await request(app)
      .post("/api/pagos")
      .set("Authorization", auth)
      .send({ id_cliente: 1, metodo_pago: "EFECTIVO", monto: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/monto/i);
  });

  it("rechaza método de pago inválido (400)", async () => {
    const auth = primeAuth(poolMock, cobrador());

    const res = await request(app)
      .post("/api/pagos")
      .set("Authorization", auth)
      .send({ id_cliente: 1, metodo_pago: "BITCOIN", monto: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/método/i);
  });

  it("400 si el cliente está INACTIVO", async () => {
    const auth = primeAuth(poolMock, cobrador());
    poolMock.query.mockResolvedValueOnce({
      rows: [{ id_cliente: 1, estado: "INACTIVO" }],
    });

    const res = await request(app)
      .post("/api/pagos")
      .set("Authorization", auth)
      .send({ id_cliente: 1, metodo_pago: "EFECTIVO", monto: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inactivo/i);
  });

  it("400 si la orden no pertenece al cliente", async () => {
    const auth = primeAuth(poolMock, cobrador());
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ id_cliente: 1, estado: "ACTIVO" }] })
      .mockResolvedValueOnce({
        rows: [{ id_orden_trabajo: 50, id_cliente: 99 }],
      });

    const res = await request(app)
      .post("/api/pagos")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_orden_trabajo: 50,
        metodo_pago: "EFECTIVO",
        monto: 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no pertenece/i);
  });

  it("crea pago (201) y registra auditoría PAGO", async () => {
    const auth = primeAuth(poolMock, cobrador());
    const pago = {
      id_pago: 10,
      id_cliente: 1,
      monto: 250,
      metodo_pago: "EFECTIVO",
    };

    poolMock.query
      .mockResolvedValueOnce({ rows: [{ id_cliente: 1, estado: "ACTIVO" }] }) // SELECT cliente
      .mockResolvedValueOnce({ rows: [pago] }) // INSERT pago
      .mockResolvedValueOnce({ rows: [] }); // INSERT auditoría

    const res = await request(app)
      .post("/api/pagos")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        metodo_pago: "EFECTIVO",
        monto: 250,
        fecha_pago: "2026-04-24",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id_pago: 10, monto: 250 });

    const auditCall = poolMock.query.mock.calls[3]; // [auth, cliente, INSERT pago, audit]
    expect(auditCall[0]).toMatch(/INSERT INTO auditoria_eventos/i);
    expect(auditCall[1][2]).toBe("PAGO");
  });
});

// =============================================================================
// CREAR CRÉDITO
// =============================================================================
describe("POST /api/pagos/creditos — crear crédito", () => {
  const supervisor = () => makeUsuario({ id_usuario: 1, rol: "SUPERVISOR" });

  it("rechaza monto_pagado > monto_total (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .post("/api/pagos/creditos")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_orden_trabajo: 5,
        monto_total: 100,
        monto_pagado: 200,
        fecha_vencimiento: "2026-12-31",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/monto pagado.*mayor/i);
  });

  it("rechaza sin fecha_vencimiento (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .post("/api/pagos/creditos")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_orden_trabajo: 5,
        monto_total: 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/vencimiento/i);
  });

  it("calcula saldo_pendiente = monto_total - monto_pagado y estado PARCIAL", async () => {
    const auth = primeAuth(poolMock, supervisor());
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ id_cliente: 1, estado: "ACTIVO" }] })
      .mockResolvedValueOnce({
        rows: [{ id_orden_trabajo: 5, id_cliente: 1, total_orden: 500 }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id_credito: 100,
            monto_total: 500,
            monto_pagado: 200,
            saldo_pendiente: 300,
            estado: "PARCIAL",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/pagos/creditos")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_orden_trabajo: 5,
        monto_total: 500,
        monto_pagado: 200,
        fecha_vencimiento: "2099-12-31",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      saldo_pendiente: 300,
      estado: "PARCIAL",
    });

    // Verifica los args del INSERT
    const insertCall = poolMock.query.mock.calls[3]; // [auth, cliente, orden, INSERT, audit]
    expect(insertCall[1][4]).toBe(300); // saldo_pendiente
    expect(insertCall[1][8]).toBe("PARCIAL"); // estado
  });

  it("estado PENDIENTE cuando monto_pagado = 0 y vencimiento futuro", async () => {
    const auth = primeAuth(poolMock, supervisor());
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ id_cliente: 1, estado: "ACTIVO" }] })
      .mockResolvedValueOnce({
        rows: [{ id_orden_trabajo: 5, id_cliente: 1 }],
      })
      .mockResolvedValueOnce({
        rows: [{ id_credito: 100, estado: "PENDIENTE" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post("/api/pagos/creditos")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_orden_trabajo: 5,
        monto_total: 500,
        fecha_vencimiento: "2099-12-31",
      });

    const insertCall = poolMock.query.mock.calls[3];
    expect(insertCall[1][8]).toBe("PENDIENTE");
  });

  it("estado VENCIDO cuando monto_pagado=0 y vencimiento pasado", async () => {
    const auth = primeAuth(poolMock, supervisor());
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ id_cliente: 1, estado: "ACTIVO" }] })
      .mockResolvedValueOnce({
        rows: [{ id_orden_trabajo: 5, id_cliente: 1 }],
      })
      .mockResolvedValueOnce({
        rows: [{ id_credito: 100, estado: "VENCIDO" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post("/api/pagos/creditos")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_orden_trabajo: 5,
        monto_total: 500,
        fecha_vencimiento: "2000-01-01",
      });

    const insertCall = poolMock.query.mock.calls[3];
    expect(insertCall[1][8]).toBe("VENCIDO");
  });

  it("estado PAGADO cuando monto_pagado = monto_total (idempotente)", async () => {
    const auth = primeAuth(poolMock, supervisor());
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ id_cliente: 1, estado: "ACTIVO" }] })
      .mockResolvedValueOnce({
        rows: [{ id_orden_trabajo: 5, id_cliente: 1 }],
      })
      .mockResolvedValueOnce({
        rows: [{ id_credito: 100, estado: "PAGADO" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post("/api/pagos/creditos")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        id_orden_trabajo: 5,
        monto_total: 500,
        monto_pagado: 500,
        fecha_vencimiento: "2099-12-31",
      });

    const insertCall = poolMock.query.mock.calls[3];
    expect(insertCall[1][4]).toBe(0); // saldo_pendiente
    expect(insertCall[1][8]).toBe("PAGADO");
  });
});

// =============================================================================
// APLICAR PAGO A CRÉDITO (transaccional)
// =============================================================================
describe("POST /api/pagos/creditos/aplicar-pago — abono y cierre", () => {
  const cobrador = () => makeUsuario({ id_usuario: 7, rol: "COBRADOR" });

  // ─── PROTECCIÓN ANTI-RACE-CONDITION ────────────────────────────────────
  it("el SELECT del crédito usa FOR UPDATE para bloquear la fila", async () => {
    const auth = primeAuth(poolMock, cobrador());
    const credito = {
      id_credito: 1,
      estado: "PENDIENTE",
      saldo_pendiente: 500,
      monto_total: 500,
      monto_pagado: 0,
      id_cliente: 1,
      id_orden_trabajo: 5,
      fecha_vencimiento: "2099-12-31",
    };

    seedClientResponses([
      { rows: [credito] },
      { rows: [{ id_pago: 99, monto: 100 }] },
      { rows: [] },
      { rows: [{ id_pago_credito: 1 }] },
      { rows: [{ ...credito, monto_pagado: 100, saldo_pendiente: 400, estado: "PARCIAL" }] },
      { rows: [] },
    ]);

    await request(app)
      .post("/api/pagos/creditos/aplicar-pago")
      .set("Authorization", auth)
      .send({ id_credito: 1, metodo_pago: "EFECTIVO", monto: 100 });

    // Sin FOR UPDATE, dos abonos concurrentes leerían el mismo saldo,
    // ambos validarían que monto<=saldo y ambos se commitearían:
    // doble cobro registrado, saldo decrementado solo una vez.
    const selectCreditoCall = clientMock.query.mock.calls.find((c) =>
      /SELECT[\s\S]*FROM creditos[\s\S]*WHERE id_credito/i.test(String(c[0]))
    );
    expect(selectCreditoCall).toBeDefined();
    expect(String(selectCreditoCall[0])).toMatch(/FOR UPDATE/i);
  });

  it("rechaza pago sobre crédito ya PAGADO (400)", async () => {
    const auth = primeAuth(poolMock, cobrador());
    seedClientResponses([
      {
        rows: [
          {
            id_credito: 1,
            estado: "PAGADO",
            saldo_pendiente: 0,
            monto_total: 500,
            monto_pagado: 500,
          },
        ],
      },
    ]);

    const res = await request(app)
      .post("/api/pagos/creditos/aplicar-pago")
      .set("Authorization", auth)
      .send({ id_credito: 1, metodo_pago: "EFECTIVO", monto: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ya está pagado/i);

    const sqls = clientMock.query.mock.calls.map((c) => String(c[0]).trim().toUpperCase());
    expect(sqls).toContain("ROLLBACK");
  });

  it("rechaza pago sobre crédito CANCELADO (400)", async () => {
    const auth = primeAuth(poolMock, cobrador());
    seedClientResponses([
      {
        rows: [
          { id_credito: 1, estado: "CANCELADO", saldo_pendiente: 100, monto_total: 100, monto_pagado: 0 },
        ],
      },
    ]);

    const res = await request(app)
      .post("/api/pagos/creditos/aplicar-pago")
      .set("Authorization", auth)
      .send({ id_credito: 1, metodo_pago: "EFECTIVO", monto: 50 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cancelado/i);
  });

  it("rechaza monto que excede el saldo pendiente (400)", async () => {
    const auth = primeAuth(poolMock, cobrador());
    seedClientResponses([
      {
        rows: [
          {
            id_credito: 1,
            estado: "PARCIAL",
            saldo_pendiente: 50,
            monto_total: 500,
            monto_pagado: 450,
            id_cliente: 1,
            id_orden_trabajo: 5,
            fecha_vencimiento: "2099-12-31",
          },
        ],
      },
    ]);

    const res = await request(app)
      .post("/api/pagos/creditos/aplicar-pago")
      .set("Authorization", auth)
      .send({ id_credito: 1, metodo_pago: "EFECTIVO", monto: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/excede.*saldo/i);
  });

  it("abono parcial → estado PARCIAL, saldo recalculado, auditoría ABONO", async () => {
    const auth = primeAuth(poolMock, cobrador());
    const credito = {
      id_credito: 1,
      estado: "PENDIENTE",
      saldo_pendiente: 500,
      monto_total: 500,
      monto_pagado: 0,
      id_cliente: 1,
      id_orden_trabajo: 5,
      fecha_vencimiento: "2099-12-31",
    };
    const pago = { id_pago: 99, monto: 200 };
    const creditoActualizado = {
      ...credito,
      monto_pagado: 200,
      saldo_pendiente: 300,
      estado: "PARCIAL",
    };

    seedClientResponses([
      { rows: [credito] }, // SELECT credito
      { rows: [pago] }, // INSERT pago
      { rows: [] }, // INSERT auditoría PAGO
      { rows: [{ id_pago_credito: 7 }] }, // INSERT pagos_credito (devuelve el id ahora)
      { rows: [creditoActualizado] }, // UPDATE credito
      { rows: [] }, // INSERT auditoría ABONO
    ]);

    const res = await request(app)
      .post("/api/pagos/creditos/aplicar-pago")
      .set("Authorization", auth)
      .send({ id_credito: 1, metodo_pago: "EFECTIVO", monto: 200 });

    expect(res.status).toBe(201);
    expect(res.body.credito_actualizado).toMatchObject({
      monto_pagado: 200,
      saldo_pendiente: 300,
      estado: "PARCIAL",
    });
    expect(res.body.id_pago_credito).toBe(7);

    // UPDATE creditos: args = [monto_pagado, saldo_pendiente, estado, id_credito]
    const updateCall = clientMock.query.mock.calls.find((c) =>
      /UPDATE creditos/i.test(String(c[0]))
    );
    expect(updateCall[1][0]).toBe(200);
    expect(updateCall[1][1]).toBe(300);
    expect(updateCall[1][2]).toBe("PARCIAL");

    // Auditorías PAGO + ABONO
    const audits = clientMock.query.mock.calls.filter((c) =>
      /INSERT INTO auditoria_eventos/i.test(String(c[0]))
    );
    expect(audits).toHaveLength(2);
    expect(audits[0][1][2]).toBe("PAGO");
    expect(audits[1][1][2]).toBe("ABONO");

    // COMMIT y release
    const sqls = clientMock.query.mock.calls.map((c) => String(c[0]).trim().toUpperCase());
    expect(sqls).toContain("COMMIT");
    expect(sqls).not.toContain("ROLLBACK");
    expect(clientMock.release).toHaveBeenCalled();
  });

  it("abono que cubre el saldo total → estado PAGADO, saldo 0", async () => {
    const auth = primeAuth(poolMock, cobrador());
    const credito = {
      id_credito: 1,
      estado: "PARCIAL",
      saldo_pendiente: 100,
      monto_total: 500,
      monto_pagado: 400,
      id_cliente: 1,
      id_orden_trabajo: 5,
      fecha_vencimiento: "2099-12-31",
    };
    const pago = { id_pago: 99, monto: 100 };
    const creditoActualizado = {
      ...credito,
      monto_pagado: 500,
      saldo_pendiente: 0,
      estado: "PAGADO",
    };

    seedClientResponses([
      { rows: [credito] },
      { rows: [pago] },
      { rows: [] },
      { rows: [{ id_pago_credito: 8 }] },
      { rows: [creditoActualizado] },
      { rows: [] },
    ]);

    const res = await request(app)
      .post("/api/pagos/creditos/aplicar-pago")
      .set("Authorization", auth)
      .send({ id_credito: 1, metodo_pago: "TRANSFERENCIA", monto: 100 });

    expect(res.status).toBe(201);
    expect(res.body.credito_actualizado.estado).toBe("PAGADO");
    expect(res.body.credito_actualizado.saldo_pendiente).toBe(0);

    const updateCall = clientMock.query.mock.calls.find((c) =>
      /UPDATE creditos/i.test(String(c[0]))
    );
    expect(updateCall[1][2]).toBe("PAGADO");
  });

  it("404 si el crédito no existe + ROLLBACK", async () => {
    const auth = primeAuth(poolMock, cobrador());
    seedClientResponses([{ rows: [] }]);

    const res = await request(app)
      .post("/api/pagos/creditos/aplicar-pago")
      .set("Authorization", auth)
      .send({ id_credito: 999, metodo_pago: "EFECTIVO", monto: 50 });

    expect(res.status).toBe(404);
    const sqls = clientMock.query.mock.calls.map((c) => String(c[0]).trim().toUpperCase());
    expect(sqls).toContain("ROLLBACK");
    expect(clientMock.release).toHaveBeenCalled();
  });
});

// =============================================================================
// CAMBIAR ESTADO DE CRÉDITO
// =============================================================================
describe("PATCH /api/pagos/creditos/:id/estado", () => {
  const admin = () => makeUsuario({ rol: "ADMIN" });

  it("rechaza estado inválido (400)", async () => {
    const auth = primeAuth(poolMock, admin());

    const res = await request(app)
      .patch("/api/pagos/creditos/1/estado")
      .set("Authorization", auth)
      .send({ estado: "FANTASMA" });

    expect(res.status).toBe(400);
  });

  it("CANCELADO emite auditoría con accion = CANCELAR", async () => {
    const auth = primeAuth(poolMock, admin());
    const anterior = { id_credito: 1, estado: "PENDIENTE" };
    const nuevo = { id_credito: 1, estado: "CANCELADO" };
    poolMock.query
      .mockResolvedValueOnce({ rows: [anterior] })
      .mockResolvedValueOnce({ rows: [nuevo] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch("/api/pagos/creditos/1/estado")
      .set("Authorization", auth)
      .send({ estado: "CANCELADO" });

    expect(res.status).toBe(200);
    const auditCall = poolMock.query.mock.calls[3];
    expect(auditCall[1][2]).toBe("CANCELAR");
  });

  it("otros estados emiten CAMBIAR_ESTADO", async () => {
    const auth = primeAuth(poolMock, admin());
    const anterior = { id_credito: 1, estado: "PENDIENTE" };
    const nuevo = { id_credito: 1, estado: "VENCIDO" };
    poolMock.query
      .mockResolvedValueOnce({ rows: [anterior] })
      .mockResolvedValueOnce({ rows: [nuevo] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch("/api/pagos/creditos/1/estado")
      .set("Authorization", auth)
      .send({ estado: "VENCIDO" });

    expect(res.status).toBe(200);
    const auditCall = poolMock.query.mock.calls[3];
    expect(auditCall[1][2]).toBe("CAMBIAR_ESTADO");
  });
});
