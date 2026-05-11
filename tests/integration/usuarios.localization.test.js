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

describe("Usuarios API localization", () => {
  it("returns password policy errors in English when creating a user", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .post("/api/usuarios")
      .set("Authorization", auth)
      .set("X-App-Locale", "en")
      .send({
        nombre: "Pepe",
        username: "pepe",
        password: "abc1",
        rol: "OPERADOR",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Password must be at least 8 characters long");
  });

  it("returns password success message in English when changing my password", async () => {
    const authUser = makeUsuario({ id_usuario: 10, rol: "OPERADOR" });
    const auth = primeAuth(poolMock, authUser);

    const bcrypt = await import("bcrypt");
    const password_hash = await bcrypt.default.hash("Vieja12345", 4);

    poolMock.query
      .mockResolvedValueOnce({ rows: [{ ...authUser, password_hash }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch("/api/usuarios/mi/password")
      .set("Authorization", auth)
      .set("X-App-Locale", "en")
      .send({
        password_actual: "Vieja12345",
        password_nueva: "Nueva12345",
        confirmar_password: "Nueva12345",
      });

    expect(res.status).toBe(200);
    expect(res.body.mensaje).toBe("Password updated successfully");
  });

  it("returns common validator errors in English", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .patch("/api/usuarios/abc/estado")
      .set("Authorization", auth)
      .set("X-App-Locale", "en")
      .send({ estado: "INACTIVO" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Parameter id must be a positive integer");
  });
});
