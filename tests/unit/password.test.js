import { describe, it, expect } from "vitest";
import { validarPassword, PASSWORD_MIN_LENGTH } from "../../src/utils/password.js";

describe("validarPassword", () => {
  describe("contraseñas inválidas", () => {
    it("rechaza cuando es undefined", () => {
      const r = validarPassword(undefined);
      expect(r.valid).toBe(false);
      expect(r.error).toBe("La contraseña es obligatoria");
    });

    it("rechaza cuando es null", () => {
      const r = validarPassword(null);
      expect(r.valid).toBe(false);
      expect(r.error).toBe("La contraseña es obligatoria");
    });

    it("rechaza cuando es string vacío", () => {
      const r = validarPassword("");
      expect(r.valid).toBe(false);
      expect(r.error).toBe("La contraseña es obligatoria");
    });

    it("rechaza cuando no es string (número)", () => {
      const r = validarPassword(12345678);
      expect(r.valid).toBe(false);
      expect(r.error).toBe("La contraseña es obligatoria");
    });

    it("rechaza cuando tiene menos de 8 caracteres (con letra y número)", () => {
      const r = validarPassword("abc123");
      expect(r.valid).toBe(false);
      expect(r.error).toContain(String(PASSWORD_MIN_LENGTH));
    });

    it("rechaza cuando tiene 7 caracteres (borde)", () => {
      const r = validarPassword("abc1234");
      expect(r.valid).toBe(false);
      expect(r.error).toContain(String(PASSWORD_MIN_LENGTH));
    });

    it("rechaza cuando solo tiene letras", () => {
      const r = validarPassword("abcdefgh");
      expect(r.valid).toBe(false);
      expect(r.error).toBe("La contraseña debe incluir al menos una letra y un número");
    });

    it("rechaza cuando solo tiene números", () => {
      const r = validarPassword("12345678");
      expect(r.valid).toBe(false);
      expect(r.error).toBe("La contraseña debe incluir al menos una letra y un número");
    });

    it("rechaza cuando solo tiene símbolos", () => {
      const r = validarPassword("!@#$%^&*");
      expect(r.valid).toBe(false);
      expect(r.error).toBe("La contraseña debe incluir al menos una letra y un número");
    });
  });

  describe("contraseñas válidas", () => {
    it("acepta con 8 chars, letras y números", () => {
      expect(validarPassword("abc12345")).toEqual({ valid: true });
    });

    it("acepta con mayúsculas", () => {
      expect(validarPassword("Abcd1234")).toEqual({ valid: true });
    });

    it("acepta con símbolos adicionales", () => {
      expect(validarPassword("P@ssw0rd!")).toEqual({ valid: true });
    });

    it("acepta passwords largos (50 chars)", () => {
      const pwd = "a".repeat(45) + "12345";
      expect(validarPassword(pwd)).toEqual({ valid: true });
    });
  });

  it("PASSWORD_MIN_LENGTH es 8", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});
