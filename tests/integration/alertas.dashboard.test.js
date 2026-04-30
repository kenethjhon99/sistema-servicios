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

describe("Alertas - dashboard base", () => {
  it("devuelve resumen y serie diaria filtrada por rango", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ total: 3 }] })
      .mockResolvedValueOnce({ rows: [{ total: 4 }] })
      .mockResolvedValueOnce({ rows: [{ total: 150.5 }] })
      .mockResolvedValueOnce({ rows: [{ total: 980.25 }] })
      .mockResolvedValueOnce({ rows: [{ total: 9 }] })
      .mockResolvedValueOnce({ rows: [{ total: 6 }] })
      .mockResolvedValueOnce({
        rows: [{ id_alerta: 7, titulo: "Alerta demo", mensaje: "Revisar" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            fecha: "2026-04-01",
            servicios_programados: 2,
            pagos_cobrados: 100,
            alertas_creadas: 1,
          },
          {
            fecha: "2026-04-02",
            servicios_programados: 1,
            pagos_cobrados: 80.5,
            alertas_creadas: 0,
          },
        ],
      });

    const res = await request(app)
      .get("/api/alertas/dashboard/base?fecha_desde=2026-04-01&fecha_hasta=2026-04-02")
      .set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.periodo).toEqual({
      fecha_desde: "2026-04-01",
      fecha_hasta: "2026-04-02",
    });
    expect(res.body.resumen).toMatchObject({
      servicios_hoy: 2,
      servicios_manana: 1,
      servicios_atrasados: 3,
      creditos_vencidos: 4,
    });
    expect(res.body.serie_diaria).toHaveLength(2);
    expect(res.body.totales_periodo).toMatchObject({
      servicios_programados: 3,
      pagos_cobrados: 180.5,
      alertas_creadas: 1,
    });
  });

  it("rechaza rango invalido", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    const res = await request(app)
      .get("/api/alertas/dashboard/base?fecha_desde=2026-05-10&fecha_hasta=2026-05-01")
      .set("Authorization", auth);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/fecha desde/i);
  });
});
