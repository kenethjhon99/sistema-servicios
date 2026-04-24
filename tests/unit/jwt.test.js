import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { createToken, verifyToken } from "../../src/utils/jwt.js";

describe("jwt utils", () => {
  it("createToken genera un JWT válido con el payload", () => {
    const token = createToken({ id_usuario: 1, rol: "ADMIN" });
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3); // header.payload.signature
  });

  it("verifyToken decodifica un token generado por createToken", () => {
    const token = createToken({ id_usuario: 42, rol: "OPERADOR" });
    const decoded = verifyToken(token);

    expect(decoded.id_usuario).toBe(42);
    expect(decoded.rol).toBe("OPERADOR");
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });

  it("verifyToken lanza cuando el token es inválido", () => {
    expect(() => verifyToken("not.a.valid.token")).toThrow();
  });

  it("verifyToken lanza cuando el token fue firmado con otro secreto", () => {
    const otroToken = jwt.sign({ id_usuario: 1 }, "otro_secreto_distinto");
    expect(() => verifyToken(otroToken)).toThrow();
  });

  it("verifyToken lanza cuando el token expiró", () => {
    const tokenExpirado = jwt.sign(
      { id_usuario: 1 },
      process.env.JWT_SECRET,
      { expiresIn: "-1s" }
    );
    expect(() => verifyToken(tokenExpirado)).toThrow(/jwt expired/);
  });
});
