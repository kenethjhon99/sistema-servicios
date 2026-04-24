import { describe, it, expect, vi } from "vitest";
import {
  validateIdParam,
  parsePagination,
} from "../../src/middlewares/validators.middleware.js";

/**
 * Helpers para simular (req, res, next) de Express.
 */
const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const mockNext = () => vi.fn();

describe("validateIdParam", () => {
  it("llama next() y parsea el id a número cuando es entero positivo", () => {
    const middleware = validateIdParam("id");
    const req = { params: { id: "42" } };
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.params.id).toBe(42);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("acepta el número 1 como entero positivo", () => {
    const middleware = validateIdParam("id");
    const req = { params: { id: "1" } };
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.params.id).toBe(1);
  });

  it("responde 400 cuando el id es 0", () => {
    const middleware = validateIdParam("id");
    const req = { params: { id: "0" } };
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("entero positivo") })
    );
  });

  it("responde 400 cuando el id es negativo", () => {
    const middleware = validateIdParam("id");
    const req = { params: { id: "-5" } };
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("responde 400 cuando el id no es numérico", () => {
    const middleware = validateIdParam("id");
    const req = { params: { id: "abc" } };
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("responde 400 cuando el id es decimal", () => {
    const middleware = validateIdParam("id");
    const req = { params: { id: "3.14" } };
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("responde 400 cuando el parámetro falta", () => {
    const middleware = validateIdParam("id");
    const req = { params: {} };
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("Falta") })
    );
  });

  it("funciona con nombres de parámetro personalizados", () => {
    const middleware = validateIdParam("id_cliente");
    const req = { params: { id_cliente: "7" } };
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.params.id_cliente).toBe(7);
  });

  it("el mensaje de error menciona el nombre del parámetro", () => {
    const middleware = validateIdParam("id_orden");
    const req = { params: { id_orden: "xyz" } };
    const res = mockRes();
    const next = mockNext();

    middleware(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("id_orden") })
    );
  });
});

describe("parsePagination", () => {
  it("aplica defaults cuando no hay query params", () => {
    const req = { query: {} };
    const res = mockRes();
    const next = mockNext();

    parsePagination(req, res, next);

    expect(req.pagination).toEqual({ page: 1, limit: 50, offset: 0 });
    expect(next).toHaveBeenCalled();
  });

  it("calcula offset correcto para page=3, limit=20", () => {
    const req = { query: { page: "3", limit: "20" } };
    const res = mockRes();
    const next = mockNext();

    parsePagination(req, res, next);

    expect(req.pagination).toEqual({ page: 3, limit: 20, offset: 40 });
  });

  it("fuerza page >= 1 cuando llega 0 o negativo", () => {
    const req = { query: { page: "0" } };
    const res = mockRes();
    parsePagination(req, res, mockNext());
    expect(req.pagination.page).toBe(1);

    const req2 = { query: { page: "-5" } };
    parsePagination(req2, mockRes(), mockNext());
    expect(req2.pagination.page).toBe(1);
  });

  it("topa limit en 200 (máximo)", () => {
    const req = { query: { limit: "999" } };
    const res = mockRes();
    parsePagination(req, res, mockNext());

    expect(req.pagination.limit).toBe(200);
  });

  it("fuerza limit >= 1 cuando llega 0", () => {
    const req = { query: { limit: "0" } };
    const res = mockRes();
    parsePagination(req, res, mockNext());

    expect(req.pagination.limit).toBe(50); // Number("0") || 50 = 50
  });

  it("ignora valores no numéricos y aplica defaults", () => {
    const req = { query: { page: "abc", limit: "xyz" } };
    const res = mockRes();
    parsePagination(req, res, mockNext());

    expect(req.pagination).toEqual({ page: 1, limit: 50, offset: 0 });
  });

  it("siempre llama next()", () => {
    const req = { query: {} };
    const next = mockNext();
    parsePagination(req, mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
