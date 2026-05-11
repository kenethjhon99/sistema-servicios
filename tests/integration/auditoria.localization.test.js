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

describe("Auditoria - localizacion", () => {
  it("devuelve descripciones localizadas al ingles en el listado", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id_auditoria: 77,
            tabla_afectada: "usuarios",
            id_registro: 12,
            accion: "CREAR",
            descripcion: "Se creó el usuario admin",
            valores_anteriores: null,
            valores_nuevos: { username: "admin" },
            realizado_por: 1,
            realizado_por_nombre: "Admin Test",
            realizado_por_username: "admin",
            fecha_evento: "2026-05-05T12:00:00.000Z",
          },
        ],
      });

    const res = await request(app)
      .get("/api/auditoria")
      .set("Authorization", auth)
      .set("X-App-Locale", "en");

    expect(res.status).toBe(200);
    expect(res.body.data[0].descripcion).toBe("User admin was created");
  });
});
