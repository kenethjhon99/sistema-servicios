import { vi } from "vitest";

/**
 * Factoría de pool mock que soporta:
 *  - pool.query(...)
 *  - pool.connect() → { query, release }   (para transacciones)
 *  - pool.on(...)
 *
 * El "client" devuelto por connect() tiene su PROPIO mock de query, distinto
 * del de pool. Así puedes cebar respuestas para cada uno.
 *
 * Uso típico:
 *   const { pool, client } = createPoolMock();
 *   vi.mock("../../src/config/db.js", () => ({ pool, testDB: vi.fn() }));
 *   ...
 *   client.query.mockResolvedValueOnce(...) // para ops dentro de la tx
 *   pool.query.mockResolvedValueOnce(...)   // para ops sueltas (auth middleware)
 */
export const createPoolMock = () => {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };

  const pool = {
    query: vi.fn(),
    connect: vi.fn().mockResolvedValue(client),
    on: vi.fn(),
  };

  return { pool, client };
};

/**
 * Cebar BEGIN, COMMIT/ROLLBACK como exitosos.
 * Llamar al inicio de cada test transaccional.
 */
export const primeTxBoilerplate = (client) => {
  client.query.mockImplementation((sql) => {
    const txt = String(sql).trim().toUpperCase();
    if (txt === "BEGIN" || txt === "COMMIT" || txt === "ROLLBACK") {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [] });
  });
};
