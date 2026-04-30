import { pool } from "../config/db.js";
import { env } from "../config/env.js";

const columnCache = new Map();

export const hasPublicColumn = async (tableName, columnName) => {
  if (env.NODE_ENV === "test") {
    return true;
  }

  const cacheKey = `${tableName}.${columnName}`;
  if (columnCache.has(cacheKey)) {
    return columnCache.get(cacheKey);
  }

  const { rows } = await pool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS exists
    `,
    [tableName, columnName]
  );

  const exists = Boolean(rows[0]?.exists);
  columnCache.set(cacheKey, exists);
  return exists;
};

