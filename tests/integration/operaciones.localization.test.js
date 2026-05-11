import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
let primeAuth;
let makeUsuario;

beforeAll(async () => {
  app = (await import("../../src/app.js")).default;
  ({ primeAuth, makeUsuario } = await import("../helpers/auth.js"));
});

beforeEach(() => {
  poolMock.query.mockReset();
});

describe("Operational API localization", () => {
  it("returns client validation errors in English", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .post("/api/clientes")
      .set("Authorization", auth)
      .set("X-App-Locale", "en")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Full name is required");
  });

  it("returns property validation errors in English", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .post("/api/propiedades")
      .set("Authorization", auth)
      .set("X-App-Locale", "en")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Client is required");
  });

  it("returns category duplicate errors in English", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    const duplicateError = new Error("duplicate");
    duplicateError.code = "23505";

    poolMock.query.mockRejectedValueOnce(duplicateError);

    const res = await request(app)
      .post("/api/categorias-servicio")
      .set("Authorization", auth)
      .set("X-App-Locale", "en")
      .send({ nombre: "limpieza" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("A category with that name already exists");
  });

  it("returns service validation errors in English", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .post("/api/servicios")
      .set("Authorization", auth)
      .set("X-App-Locale", "en")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Category is required");
  });

  it("returns schedule validation errors in English", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .post("/api/programaciones")
      .set("Authorization", auth)
      .set("X-App-Locale", "en")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Client is required");
  });

  it("returns work order not found errors in English", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/ordenes/1")
      .set("Authorization", auth)
      .set("X-App-Locale", "en");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Order not found");
  });

  it("returns quote not found errors in English", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/cotizaciones/1")
      .set("Authorization", auth)
      .set("X-App-Locale", "en");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Quote not found");
  });

  it("returns payment validation errors in English", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .post("/api/pagos")
      .set("Authorization", auth)
      .set("X-App-Locale", "en")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Client is required");
  });

  it("returns agenda validation errors in English", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .get("/api/agenda/dia")
      .set("Authorization", auth)
      .set("X-App-Locale", "en");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("You must provide the date in YYYY-MM-DD format");
  });

  it("returns summary not found errors in English", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));
    poolMock.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/resumenes/orden/1")
      .set("Authorization", auth)
      .set("X-App-Locale", "en");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Order not found");
  });
});
