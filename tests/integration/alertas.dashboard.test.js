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
            id_cliente: 7,
            cliente: "Cliente Riesgo",
            creditos_vencidos: 2,
            saldo_pendiente_total: 640,
            max_dias_vencido: 18,
            ultimo_pago_fecha: "2026-03-28",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id_cliente: 7,
            saldo_pendiente_total: 640,
            creditos_activos: 2,
            max_dias_vencido: 18,
            ultimo_seguimiento_resultado: "PROMESA_PAGO",
            proximo_contacto: "2026-04-02",
            id_usuario_responsable: 3,
            usuario_responsable: "Collector One",
          },
          {
            id_cliente: 8,
            saldo_pendiente_total: 120,
            creditos_activos: 1,
            max_dias_vencido: 0,
            ultimo_seguimiento_resultado: null,
            proximo_contacto: null,
            id_usuario_responsable: null,
            usuario_responsable: null,
          },
        ],
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
    expect(res.body.cobranza_foco).toMatchObject({
      total_clientes_prioritarios: 1,
      saldo_prioritario_total: 640,
      creditos_vencidos_total: 2,
      seguimiento_resumen: {
        promesas_pago: 1,
        sin_respuesta: 0,
        sin_seguimiento: 1,
        contactos_vencidos: 1,
      },
    });
    expect(res.body.cobranza_foco.clientes_prioritarios[0]).toMatchObject({
      cliente: "Cliente Riesgo",
      max_dias_vencido: 18,
    });
    expect(res.body.cobranza_foco.responsable_principal).toMatchObject({
      usuario_responsable: "Collector One",
      clientes: 1,
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

  it("localiza las alertas recientes al ingles cuando el request lo pide", async () => {
    const auth = primeAuth(poolMock, makeUsuario({ rol: "ADMIN" }));

    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id_alerta: 9,
            tipo_alerta: "SERVICIO_HOY",
            titulo: "Servicio programado para hoy",
            mensaje: "Cliente Demo - Casa Central - Limpieza",
            modulo_origen: "PROGRAMACION",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/alertas/dashboard/base")
      .set("Authorization", auth)
      .set("X-App-Locale", "en");

    expect(res.status).toBe(200);
    expect(res.body.ultimas_alertas[0]).toMatchObject({
      titulo: "Service scheduled for today",
      mensaje: "Cliente Demo - Casa Central - Limpieza",
    });
  });
});
