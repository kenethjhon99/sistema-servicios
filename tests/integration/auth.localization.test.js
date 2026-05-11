import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcrypt";
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

const mockUsuarioRow = async (overrides = {}) => ({
  id_usuario: 1,
  nombre: "Test User",
  correo: "test@example.com",
  telefono: null,
  username: "testuser",
  rol: "ADMIN",
  estado: "ACTIVO",
  password_hash: await bcrypt.hash("Password123", 4),
  ...overrides,
});

beforeAll(async () => {
  app = (await import("../../src/app.js")).default;
});

beforeEach(() => {
  poolMock.query.mockReset();
});

describe("Auth API localization", () => {
  it("returns login validation errors in English", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("X-App-Locale", "en")
      .send({ username: "testuser" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Password is required");
  });

  it("returns login success message in English", async () => {
    const usuario = await mockUsuarioRow();
    poolMock.query
      .mockResolvedValueOnce({ rows: [usuario] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/auth/login")
      .set("X-App-Locale", "en")
      .send({ username: "testuser", password: "Password123" });

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBe("Login successful");
  });

  it("returns auth middleware errors in English", async () => {
    const res = await request(app)
      .get("/api/auth/perfil")
      .set("X-App-Locale", "en");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Missing authorization token");
  });
});
