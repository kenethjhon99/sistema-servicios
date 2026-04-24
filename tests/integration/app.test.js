import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";

// Mockear el pool ANTES de importar la app.
// Todas las rutas que toquen pool.query recibirán esta versión mock.
vi.mock("../../src/config/db.js", () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    on: vi.fn(),
  },
  testDB: vi.fn(),
}));

let app;

beforeAll(async () => {
  const mod = await import("../../src/app.js");
  app = mod.default;
});

describe("App — endpoints base", () => {
  it("GET / responde 200 con ok:true", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      env: "test",
    });
  });

  it("GET a ruta inexistente responde 404 con payload estándar", async () => {
    const res = await request(app).get("/api/no-existe-esta-ruta-xyz");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: "Recurso no encontrado",
    });
    expect(res.body.ruta).toBeDefined();
  });
});

describe("App — error handler global", () => {
  it("responde 400 cuando el body es JSON inválido", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{json_malformado");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JSON inválido/i);
  });
});

describe("App — headers de seguridad (helmet)", () => {
  it("incluye header X-Content-Type-Options: nosniff", async () => {
    const res = await request(app).get("/");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("incluye header X-DNS-Prefetch-Control", async () => {
    const res = await request(app).get("/");
    expect(res.headers["x-dns-prefetch-control"]).toBeDefined();
  });
});
