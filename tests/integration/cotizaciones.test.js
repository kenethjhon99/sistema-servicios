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
 * Helper para encadenar respuestas de client.query saltando BEGIN/COMMIT/ROLLBACK.
 * Las llamadas SELECT pg_advisory_xact_lock también se tratan como no-op.
 */
const seedClientResponses = (responses) => {
  let i = 0;
  clientMock.query.mockImplementation((sql) => {
    const txt = String(sql).trim().toUpperCase();
    if (txt === "BEGIN" || txt === "COMMIT" || txt === "ROLLBACK") {
      return Promise.resolve({ rows: [] });
    }
    if (txt.includes("PG_ADVISORY_XACT_LOCK")) {
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
describe("Cotizaciones — autorización por rol", () => {
  it("OPERADOR no puede crear cotizaciones (403)", async () => {
    const operador = makeUsuario({ id_usuario: 5, rol: "OPERADOR" });
    const auth = primeAuth(poolMock, operador);

    const res = await request(app)
      .post("/api/cotizaciones")
      .set("Authorization", auth)
      .send({});

    expect(res.status).toBe(403);
  });

  it("COBRADOR no puede convertir cotización (403)", async () => {
    const cobrador = makeUsuario({ id_usuario: 7, rol: "COBRADOR" });
    const auth = primeAuth(poolMock, cobrador);

    const res = await request(app)
      .post("/api/cotizaciones/1/convertir")
      .set("Authorization", auth)
      .send({ fecha_servicio: "2026-05-01" });

    expect(res.status).toBe(403);
  });
});

// =============================================================================
// CREAR
// =============================================================================
describe("POST /api/cotizaciones — crear", () => {
  const supervisor = () => makeUsuario({ id_usuario: 1, rol: "SUPERVISOR" });

  it("rechaza sin id_cliente (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .post("/api/cotizaciones")
      .set("Authorization", auth)
      .send({ detalles: [{ descripcion: "x", cantidad: 1, precio_unitario: 10 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cliente/i);
  });

  it("rechaza sin detalles (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .post("/api/cotizaciones")
      .set("Authorization", auth)
      .send({ id_cliente: 1, detalles: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/detalle/i);
  });

  it("rechaza descuento negativo (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .post("/api/cotizaciones")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        descuento: -50,
        detalles: [{ descripcion: "x", cantidad: 1, precio_unitario: 10 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/descuento/i);
  });

  it("404 si el cliente no existe", async () => {
    const auth = primeAuth(poolMock, supervisor());
    // El controller valida body, después hace SELECT cliente como primer
    // query — si devuelve vacío, sale en 404 sin llegar al INSERT.
    seedClientResponses([
      { rows: [] }, // SELECT cliente vacío
    ]);

    const res = await request(app)
      .post("/api/cotizaciones")
      .set("Authorization", auth)
      .send({
        id_cliente: 999,
        detalles: [{ descripcion: "x", cantidad: 1, precio_unitario: 10 }],
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/cliente.*no existe/i);
  });

  it("crea cotización en BORRADOR con número COT-YYYYMMDD-NNNNN y total calculado", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const cotInsertada = {
      id_cotizacion: 100,
      numero_cotizacion: expect.stringMatching(/^COT-\d{8}-\d{5}$/),
      id_cliente: 1,
      subtotal: 200,
      descuento: 20,
      total: 180,
      estado: "BORRADOR",
    };

    seedClientResponses([
      { rows: [{ id_cliente: 1, estado: "ACTIVO" }] }, // SELECT cliente
      { rows: [{ id_servicio: 7, estado: "ACTIVO" }] }, // SELECT servicio del detalle
      { rows: [{ total: 0 }] }, // generarNumero: COUNT
      {
        rows: [
          {
            id_cotizacion: 100,
            numero_cotizacion: "COT-20260427-00001",
            id_cliente: 1,
            subtotal: "200.00",
            descuento: "20.00",
            total: "180.00",
            estado: "BORRADOR",
          },
        ],
      }, // INSERT cabecera
      { rows: [] }, // INSERT detalle
      { rows: [] }, // INSERT auditoría
    ]);

    const res = await request(app)
      .post("/api/cotizaciones")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        descuento: 20,
        detalles: [
          {
            id_servicio: 7,
            descripcion: "Servicio X",
            cantidad: 2,
            precio_unitario: 100,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id_cotizacion: 100,
      estado: "BORRADOR",
    });
    expect(res.body.numero_cotizacion).toMatch(/^COT-\d{8}-\d{5}$/);

    // Verifica COMMIT
    const sqls = clientMock.query.mock.calls.map((c) =>
      String(c[0]).trim().toUpperCase()
    );
    expect(sqls).toContain("COMMIT");
    expect(sqls).not.toContain("ROLLBACK");
  });

  it("usa pg_advisory_xact_lock al generar el número (anti-race)", async () => {
    const auth = primeAuth(poolMock, supervisor());

    seedClientResponses([
      { rows: [{ id_cliente: 1, estado: "ACTIVO" }] },
      { rows: [{ id_servicio: 7, estado: "ACTIVO" }] },
      { rows: [{ total: 0 }] },
      {
        rows: [
          {
            id_cotizacion: 100,
            numero_cotizacion: "COT-20260427-00001",
            id_cliente: 1,
            subtotal: "200.00",
            descuento: "0.00",
            total: "200.00",
            estado: "BORRADOR",
          },
        ],
      },
      { rows: [] },
      { rows: [] },
    ]);

    await request(app)
      .post("/api/cotizaciones")
      .set("Authorization", auth)
      .send({
        id_cliente: 1,
        detalles: [
          {
            id_servicio: 7,
            descripcion: "X",
            cantidad: 2,
            precio_unitario: 100,
          },
        ],
      });

    // Sin el lock, dos cotizaciones simultáneas leerían el mismo COUNT
    // y tomarían el mismo número, violando la UNIQUE constraint.
    const lockCall = clientMock.query.mock.calls.find((c) =>
      /pg_advisory_xact_lock/i.test(String(c[0]))
    );
    expect(lockCall).toBeDefined();
  });
});

// =============================================================================
// LISTAR
// =============================================================================
describe("GET /api/cotizaciones — listar", () => {
  it("paginación + filtros", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/cotizaciones?estado=BORRADOR&id_cliente=1")
      .set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 50, total: 0 });
    const countCall = poolMock.query.mock.calls[1];
    expect(countCall[1]).toEqual(["BORRADOR", "1"]);
  });

  it("rechaza estado inválido (400)", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "SUPERVISOR" }));

    const res = await request(app)
      .get("/api/cotizaciones?estado=FANTASMA")
      .set("Authorization", auth);

    expect(res.status).toBe(400);
  });
});

// =============================================================================
// ACTUALIZAR
// =============================================================================
describe("PUT /api/cotizaciones/:id — actualizar", () => {
  const supervisor = () => makeUsuario({ id_usuario: 1, rol: "SUPERVISOR" });

  it("rechaza editar cotización en estado APROBADA (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());
    seedClientResponses([
      {
        rows: [
          {
            id_cotizacion: 1,
            estado: "APROBADA",
            id_cliente: 1,
          },
        ],
      },
    ]);

    const res = await request(app)
      .put("/api/cotizaciones/1")
      .set("Authorization", auth)
      .send({
        detalles: [{ descripcion: "x", cantidad: 1, precio_unitario: 10 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PENDIENTE|BORRADOR/i);
  });
});

// =============================================================================
// CAMBIAR ESTADO
// =============================================================================
describe("PATCH /api/cotizaciones/:id/estado — transiciones", () => {
  const supervisor = () => makeUsuario({ id_usuario: 1, rol: "SUPERVISOR" });

  it("rechaza pasar de BORRADOR a APROBADA (transición ilegal)", async () => {
    const auth = primeAuth(poolMock, supervisor());
    seedClientResponses([
      { rows: [{ id_cotizacion: 1, numero_cotizacion: "COT-X", estado: "BORRADOR" }] },
    ]);

    const res = await request(app)
      .patch("/api/cotizaciones/1/estado")
      .set("Authorization", auth)
      .send({ estado: "APROBADA" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/BORRADOR.*APROBADA/);
  });

  it("rechaza setear estado CONVERTIDA directamente (debe usar /convertir)", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .patch("/api/cotizaciones/1/estado")
      .set("Authorization", auth)
      .send({ estado: "CONVERTIDA" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/convertir/i);
  });

  it("transición válida BORRADOR → ENVIADA emite CAMBIAR_ESTADO en auditoría", async () => {
    const auth = primeAuth(poolMock, supervisor());
    const anterior = {
      id_cotizacion: 1,
      numero_cotizacion: "COT-X",
      estado: "BORRADOR",
    };
    const actualizada = { ...anterior, estado: "ENVIADA" };

    seedClientResponses([
      { rows: [anterior] },
      { rows: [actualizada] },
      { rows: [] }, // INSERT auditoría
    ]);

    const res = await request(app)
      .patch("/api/cotizaciones/1/estado")
      .set("Authorization", auth)
      .send({ estado: "ENVIADA" });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("ENVIADA");

    const auditCall = clientMock.query.mock.calls.find((c) =>
      /INSERT INTO auditoria_eventos/i.test(String(c[0]))
    );
    expect(auditCall[1][2]).toBe("CAMBIAR_ESTADO");
  });

  it("transición a RECHAZADA emite acción CANCELAR", async () => {
    const auth = primeAuth(poolMock, supervisor());
    const anterior = {
      id_cotizacion: 1,
      numero_cotizacion: "COT-X",
      estado: "ENVIADA",
    };
    const actualizada = { ...anterior, estado: "RECHAZADA" };

    seedClientResponses([
      { rows: [anterior] },
      { rows: [actualizada] },
      { rows: [] },
    ]);

    const res = await request(app)
      .patch("/api/cotizaciones/1/estado")
      .set("Authorization", auth)
      .send({ estado: "RECHAZADA" });

    expect(res.status).toBe(200);
    const auditCall = clientMock.query.mock.calls.find((c) =>
      /INSERT INTO auditoria_eventos/i.test(String(c[0]))
    );
    expect(auditCall[1][2]).toBe("CANCELAR");
  });
});

// =============================================================================
// CONVERTIR A ORDEN — la transición clave
// =============================================================================
describe("POST /api/cotizaciones/:id/convertir — conversión a orden", () => {
  const supervisor = () => makeUsuario({ id_usuario: 1, rol: "SUPERVISOR" });

  it("rechaza sin fecha_servicio (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());

    const res = await request(app)
      .post("/api/cotizaciones/1/convertir")
      .set("Authorization", auth)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fecha_servicio/i);
  });

  it("rechaza si la cotización NO está APROBADA (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());
    seedClientResponses([
      {
        rows: [
          {
            id_cotizacion: 1,
            numero_cotizacion: "COT-X",
            estado: "BORRADOR",
            id_cliente: 1,
            id_propiedad: 2,
          },
        ],
      },
    ]);

    const res = await request(app)
      .post("/api/cotizaciones/1/convertir")
      .set("Authorization", auth)
      .send({ fecha_servicio: "2026-05-01" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/APROBADA/);
  });

  it("rechaza si la cotización no tiene id_propiedad (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());
    seedClientResponses([
      {
        rows: [
          {
            id_cotizacion: 1,
            numero_cotizacion: "COT-X",
            estado: "APROBADA",
            id_cliente: 1,
            id_propiedad: null,
          },
        ],
      },
    ]);

    const res = await request(app)
      .post("/api/cotizaciones/1/convertir")
      .set("Authorization", auth)
      .send({ fecha_servicio: "2026-05-01" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/propiedad/i);
  });

  it("rechaza si algún detalle no tiene id_servicio (400)", async () => {
    const auth = primeAuth(poolMock, supervisor());
    seedClientResponses([
      {
        rows: [
          {
            id_cotizacion: 1,
            numero_cotizacion: "COT-X",
            estado: "APROBADA",
            id_cliente: 1,
            id_propiedad: 2,
            descuento: "0",
            subtotal: "100",
            total: "100",
            observaciones: null,
          },
        ],
      },
      {
        rows: [
          {
            id_cotizacion_detalle: 1,
            id_servicio: null, // ← problema
            descripcion: "Servicio libre sin id",
            cantidad: 1,
            precio_unitario: 100,
            subtotal: 100,
            servicio_estado: null,
          },
        ],
      },
    ]);

    const res = await request(app)
      .post("/api/cotizaciones/1/convertir")
      .set("Authorization", auth)
      .send({ fecha_servicio: "2026-05-01" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/id_servicio/i);
  });

  it("convierte exitosamente: crea orden, marca CONVERTIDA y emite auditoría dual", async () => {
    const auth = primeAuth(poolMock, supervisor());
    const cotizacion = {
      id_cotizacion: 1,
      numero_cotizacion: "COT-20260427-00001",
      estado: "APROBADA",
      id_cliente: 1,
      id_propiedad: 2,
      descuento: "20.00",
      subtotal: "200.00",
      total: "180.00",
      observaciones: "trabajar en el patio",
    };
    const detalles = [
      {
        id_cotizacion_detalle: 1,
        id_servicio: 7,
        descripcion: "Poda",
        cantidad: 2,
        precio_unitario: 100,
        subtotal: 200,
        descripcion_precio: null,
        servicio_estado: "ACTIVO",
      },
    ];
    const ordenInsertada = {
      id_orden_trabajo: 50,
      numero_orden: "OT-20260427-153000",
      id_cliente: 1,
      id_propiedad: 2,
    };
    const cotizacionConvertida = { ...cotizacion, estado: "CONVERTIDA" };

    seedClientResponses([
      { rows: [cotizacion] },           // SELECT cotizacion FOR UPDATE
      { rows: detalles },               // SELECT detalles
      { rows: [ordenInsertada] },       // INSERT ordenes_trabajo
      { rows: [] },                     // INSERT ordenes_trabajo_detalle
      { rows: [cotizacionConvertida] }, // UPDATE cotizaciones → CONVERTIDA
      { rows: [] },                     // INSERT auditoría CONVERTIR (cotizaciones)
      { rows: [] },                     // INSERT auditoría CREAR (ordenes_trabajo)
    ]);

    const res = await request(app)
      .post("/api/cotizaciones/1/convertir")
      .set("Authorization", auth)
      .send({ fecha_servicio: "2026-05-01" });

    expect(res.status).toBe(201);
    expect(res.body.cotizacion.estado).toBe("CONVERTIDA");
    expect(res.body.orden).toMatchObject({
      id_orden_trabajo: 50,
    });

    // Verifica auditoría dual
    const audits = clientMock.query.mock.calls.filter((c) =>
      /INSERT INTO auditoria_eventos/i.test(String(c[0]))
    );
    expect(audits).toHaveLength(2);
    expect(audits[0][1][2]).toBe("CONVERTIR");
    expect(audits[1][1][2]).toBe("CREAR");

    // Verifica COMMIT
    const sqls = clientMock.query.mock.calls.map((c) =>
      String(c[0]).trim().toUpperCase()
    );
    expect(sqls).toContain("COMMIT");
    expect(sqls).not.toContain("ROLLBACK");

    // La orden debe heredar totales de la cotización
    const ordenInsertCall = clientMock.query.mock.calls.find((c) =>
      /INSERT INTO ordenes_trabajo \(/i.test(String(c[0]))
    );
    // descuento = $6, subtotal = $7, total_orden = $8
    expect(ordenInsertCall[1][5]).toBe("20.00"); // descuento
    expect(ordenInsertCall[1][6]).toBe("200.00"); // subtotal
    expect(ordenInsertCall[1][7]).toBe("180.00"); // total
  });

  it("usa SELECT FOR UPDATE en la cotización para serializar conversión", async () => {
    const auth = primeAuth(poolMock, supervisor());
    seedClientResponses([
      {
        rows: [
          {
            id_cotizacion: 1,
            numero_cotizacion: "COT-X",
            estado: "BORRADOR",
            id_cliente: 1,
            id_propiedad: 2,
          },
        ],
      },
    ]);

    await request(app)
      .post("/api/cotizaciones/1/convertir")
      .set("Authorization", auth)
      .send({ fecha_servicio: "2026-05-01" });

    const selectCall = clientMock.query.mock.calls.find((c) =>
      /FROM cotizaciones[\s\S]*WHERE id_cotizacion/i.test(String(c[0]))
    );
    expect(selectCall).toBeDefined();
    expect(String(selectCall[0])).toMatch(/FOR UPDATE/i);
  });
});

// =============================================================================
// PDF DE COTIZACIÓN
// =============================================================================
describe("GET /api/documentos/cotizacion/:id_cotizacion", () => {
  it("requiere auth (401)", async () => {
    const res = await request(app).get("/api/documentos/cotizacion/1");
    expect(res.status).toBe(401);
  });

  it("404 cuando no existe", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/documentos/cotizacion/999")
      .set("Authorization", auth);

    expect(res.status).toBe(404);
  });

  it("devuelve PDF con shape correcto", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query
      .mockResolvedValueOnce({
        rows: [
          {
            id_cotizacion: 1,
            numero_cotizacion: "COT-20260427-00001",
            fecha_cotizacion: "2026-04-27",
            vigencia_hasta: "2026-05-27",
            subtotal: "200.00",
            descuento: "20.00",
            total: "180.00",
            estado: "ENVIADA",
            observaciones: "test",
            id_cliente: 1,
            nombre_completo: "Cliente Test",
            nombre_empresa: null,
            telefono: "5555",
            nit: "123",
            idioma_preferido: "es",
            nombre_propiedad: "Casa A",
            propiedad_direccion: "Calle 1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id_cotizacion_detalle: 1,
            descripcion: "Poda",
            servicio: "Poda",
            cantidad: 2,
            precio_unitario: "100.00",
            subtotal: "200.00",
          },
        ],
      });

    const res = await request(app)
      .get("/api/documentos/cotizacion/1")
      .set("Authorization", auth)
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(
      /cotizacion-COT-20260427-00001-es\.pdf/
    );
    expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
  });
});
