import { describe, it, expect, vi } from "vitest";
import { requireRole } from "../../src/middlewares/auth.middleware.js";

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe("requireRole", () => {
  it("llama next() cuando el usuario tiene un rol permitido", () => {
    const middleware = requireRole("ADMIN", "SUPERVISOR");
    const req = { user: { rol: "ADMIN" } };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("acepta cuando el usuario tiene cualquiera de los roles permitidos", () => {
    const middleware = requireRole("ADMIN", "SUPERVISOR", "OPERADOR");
    const req = { user: { rol: "OPERADOR" } };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("responde 403 cuando el rol no está permitido", () => {
    const middleware = requireRole("ADMIN");
    const req = { user: { rol: "OPERADOR" } };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("permisos") })
    );
  });

  it("responde 401 cuando no hay usuario autenticado", () => {
    const middleware = requireRole("ADMIN");
    const req = {}; // sin req.user
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("es case-sensitive (rol 'admin' ≠ 'ADMIN')", () => {
    const middleware = requireRole("ADMIN");
    const req = { user: { rol: "admin" } };
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
