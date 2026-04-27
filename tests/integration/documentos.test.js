import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";

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

const mockPagoRow = (overrides = {}) => ({
  id_pago: 42,
  fecha_pago: "2026-04-26",
  metodo_pago: "EFECTIVO",
  monto: "250.00",
  referencia_pago: "ref-123",
  observaciones: "pago parcial",
  numero_orden: "OT-20260426-120000",
  registrado_por_nombre: "Cobrador A",
  id_cliente: 1,
  codigo_cliente: "CL-0001",
  nombre_completo: "Cliente Test",
  nombre_empresa: "Empresa SA",
  telefono: "5555-5555",
  correo: "cliente@test.com",
  direccion_principal: "Calle 1, zona 10",
  nit: "1234567-8",
  idioma_preferido: "es",
  ...overrides,
});

describe("GET /api/documentos/recibo-pago/:id_pago", () => {
  it("requiere autenticación (401)", async () => {
    const res = await request(app).get("/api/documentos/recibo-pago/42");
    expect(res.status).toBe(401);
  });

  it("rechaza id_pago no numérico (400)", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .get("/api/documentos/recibo-pago/abc")
      .set("Authorization", auth);

    expect(res.status).toBe(400);
  });

  it("404 cuando el pago no existe", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/documentos/recibo-pago/999")
      .set("Authorization", auth);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no encontrado/i);
  });

  it("devuelve un PDF (Content-Type application/pdf) cuando existe", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [mockPagoRow()] });

    const res = await request(app)
      .get("/api/documentos/recibo-pago/42")
      .set("Authorization", auth)
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/recibo-pago-000042-es\.pdf/);
    // Header mágico de un PDF: %PDF-
    expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
  });

  it("respeta ?lang=en para forzar inglés en el filename", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [mockPagoRow({ idioma_preferido: "es" })] });

    const res = await request(app)
      .get("/api/documentos/recibo-pago/42?lang=en")
      .set("Authorization", auth)
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/-en\.pdf/);
  });

  it("usa el idioma del cliente cuando no se pasa ?lang", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [mockPagoRow({ idioma_preferido: "en" })] });

    const res = await request(app)
      .get("/api/documentos/recibo-pago/42")
      .set("Authorization", auth)
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/-en\.pdf/);
  });

  it("ignora ?lang con valor inválido y cae al idioma del cliente", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [mockPagoRow({ idioma_preferido: "es" })] });

    const res = await request(app)
      .get("/api/documentos/recibo-pago/42?lang=fr")
      .set("Authorization", auth)
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    // El idioma del cliente es 'es', así que el filename es -es.pdf
    expect(res.headers["content-disposition"]).toMatch(/-es\.pdf/);
  });
});

// Helper para parsear el body como buffer en tests de PDFs.
const buffered = (req) =>
  req.buffer(true).parse((res, callback) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => callback(null, Buffer.concat(chunks)));
  });

const mockOrdenRow = (overrides = {}) => ({
  id_orden_trabajo: 5,
  numero_orden: "OT-20260427-120000",
  estado: "COMPLETADA",
  fecha_servicio: "2026-04-27",
  tipo_visita: "PROGRAMADA",
  origen: "MANUAL",
  hora_inicio_programada: "08:00",
  hora_inicio_real: "08:15",
  hora_fin_real: "10:00",
  duracion_real_min: 105,
  costo_estimado: "200.00",
  observaciones_previas: "ninguna",
  observaciones_finales: "ok",
  confirmado_por_cliente: true,
  nombre_recibe: "Don Pepe",
  firma_cliente_url: null,
  motivo_cancelacion: null,
  subtotal: "300.00",
  descuento: "0.00",
  total_orden: "300.00",
  id_cliente: 1,
  nombre_completo: "Cliente Test",
  nombre_empresa: null,
  telefono: "5555-5555",
  nit: "1234567-8",
  idioma_preferido: "es",
  nombre_propiedad: "Casa principal",
  propiedad_direccion: "Calle 1, zona 10",
  cuadrilla: "Cuadrilla A",
  ...overrides,
});

describe("GET /api/documentos/ticket-servicio/:id_orden_trabajo", () => {
  it("requiere autenticación (401)", async () => {
    const res = await request(app).get("/api/documentos/ticket-servicio/5");
    expect(res.status).toBe(401);
  });

  it("404 cuando la orden no existe", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/documentos/ticket-servicio/999")
      .set("Authorization", auth);

    expect(res.status).toBe(404);
  });

  it("devuelve un PDF válido con los datos de la orden", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query
      .mockResolvedValueOnce({ rows: [mockOrdenRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            id_orden_trabajo_detalle: 1,
            servicio: "Poda",
            descripcion_servicio: null,
            cantidad: 1,
            precio_unitario: "300.00",
            subtotal: "300.00",
            estado: "COMPLETADO",
          },
        ],
      });

    const res = await buffered(
      request(app)
        .get("/api/documentos/ticket-servicio/5")
        .set("Authorization", auth)
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(
      /ticket-servicio-OT-20260427-120000-es\.pdf/
    );
    expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
  });

  it("respeta ?lang=en", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query
      .mockResolvedValueOnce({ rows: [mockOrdenRow()] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await buffered(
      request(app)
        .get("/api/documentos/ticket-servicio/5?lang=en")
        .set("Authorization", auth)
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/-en\.pdf/);
  });
});

describe("GET /api/documentos/informe-orden/:id_orden_trabajo", () => {
  it("requiere autenticación (401)", async () => {
    const res = await request(app).get("/api/documentos/informe-orden/5");
    expect(res.status).toBe(401);
  });

  it("404 cuando la orden no existe", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/documentos/informe-orden/999")
      .set("Authorization", auth);

    expect(res.status).toBe(404);
  });

  it("devuelve un PDF con detalles + evidencias", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query
      .mockResolvedValueOnce({ rows: [mockOrdenRow()] })
      .mockResolvedValueOnce({
        rows: [
          {
            id_orden_trabajo_detalle: 1,
            servicio: "Poda",
            cantidad: 1,
            precio_unitario: "300.00",
            subtotal: "300.00",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id_evidencia: 1,
            tipo_evidencia: "ANTES",
            archivo_url: "https://example.com/foto.jpg",
            descripcion: "antes",
            orden_visual: 1,
          },
        ],
      });

    const res = await buffered(
      request(app)
        .get("/api/documentos/informe-orden/5")
        .set("Authorization", auth)
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(
      /informe-orden-OT-20260427-120000-es\.pdf/
    );
    expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
  });

  it("genera correctamente cuando no hay evidencias", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query
      .mockResolvedValueOnce({ rows: [mockOrdenRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await buffered(
      request(app)
        .get("/api/documentos/informe-orden/5")
        .set("Authorization", auth)
    );

    expect(res.status).toBe(200);
    expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
  });
});

describe("GET /api/documentos/estado-cuenta/:id_cliente", () => {
  const mockCliente = (overrides = {}) => ({
    id_cliente: 1,
    codigo_cliente: "CL-0001",
    nombre_completo: "Cliente X",
    nombre_empresa: null,
    telefono: "5555",
    correo: "x@x.com",
    direccion_principal: "Calle",
    nit: "123",
    idioma_preferido: "es",
    ...overrides,
  });

  it("requiere autenticación (401)", async () => {
    const res = await request(app).get("/api/documentos/estado-cuenta/1");
    expect(res.status).toBe(401);
  });

  it("rechaza fechas con formato inválido (400)", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .get("/api/documentos/estado-cuenta/1?desde=2026/01/01&hasta=2026-12-31")
      .set("Authorization", auth);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/formato/i);
  });

  it("rechaza rango invertido desde > hasta (400)", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .get("/api/documentos/estado-cuenta/1?desde=2026-12-31&hasta=2026-01-01")
      .set("Authorization", auth);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rango/i);
  });

  it("404 cuando el cliente no existe", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/documentos/estado-cuenta/999")
      .set("Authorization", auth);

    expect(res.status).toBe(404);
  });

  it("devuelve PDF con pagos y créditos", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query
      .mockResolvedValueOnce({ rows: [mockCliente()] })
      .mockResolvedValueOnce({
        rows: [
          {
            id_pago: 1,
            fecha_pago: "2026-04-15",
            metodo_pago: "EFECTIVO",
            monto: "100.00",
            referencia_pago: null,
            numero_orden: "OT-X",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id_credito: 1,
            monto_total: "500.00",
            monto_pagado: "100.00",
            saldo_pendiente: "400.00",
            fecha_vencimiento: "2026-12-31",
            estado: "PARCIAL",
            numero_orden: "OT-Y",
          },
        ],
      });

    const res = await buffered(
      request(app)
        .get("/api/documentos/estado-cuenta/1?desde=2026-01-01&hasta=2026-12-31")
        .set("Authorization", auth)
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(
      /estado-cuenta-1-2026-01-01-2026-12-31-es\.pdf/
    );
    expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
  });

  it("usa default de últimos 30 días cuando no se pasa rango", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query
      .mockResolvedValueOnce({ rows: [mockCliente()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await buffered(
      request(app)
        .get("/api/documentos/estado-cuenta/1")
        .set("Authorization", auth)
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(
      /estado-cuenta-1-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}-es\.pdf/
    );
  });
});

describe("GET /api/documentos/recibo-abono/:id_pago_credito", () => {
  const mockAbonoRow = (overrides = {}) => ({
    id_pago_credito: 7,
    monto_aplicado: "100.00",
    id_pago: 99,
    fecha_pago: "2026-04-27",
    metodo_pago: "EFECTIVO",
    monto: "100.00",
    referencia_pago: null,
    observaciones: null,
    id_credito: 1,
    monto_total: "500.00",
    monto_pagado: "100.00",
    saldo_pendiente: "400.00",
    fecha_vencimiento: "2026-12-31",
    credito_estado: "PARCIAL",
    numero_orden: "OT-Z",
    id_cliente: 1,
    nombre_completo: "Cliente X",
    nombre_empresa: null,
    telefono: "5555",
    nit: "123",
    idioma_preferido: "es",
    registrado_por_nombre: "Cobrador A",
    ...overrides,
  });

  it("requiere autenticación (401)", async () => {
    const res = await request(app).get("/api/documentos/recibo-abono/7");
    expect(res.status).toBe(401);
  });

  it("404 cuando el abono no existe", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/documentos/recibo-abono/999")
      .set("Authorization", auth);

    expect(res.status).toBe(404);
  });

  it("devuelve PDF con datos del abono y estado actual del crédito", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [mockAbonoRow()] });

    const res = await buffered(
      request(app)
        .get("/api/documentos/recibo-abono/7")
        .set("Authorization", auth)
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/recibo-abono-000007-es\.pdf/);
    expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
  });

  it("respeta ?lang=en", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [mockAbonoRow()] });

    const res = await buffered(
      request(app)
        .get("/api/documentos/recibo-abono/7?lang=en")
        .set("Authorization", auth)
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/-en\.pdf/);
  });
});
