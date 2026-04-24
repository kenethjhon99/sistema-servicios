/**
 * Valida que un parámetro de ruta sea un entero positivo.
 * Si no lo es, responde 400 en vez de dejar que Postgres lance 500.
 *
 * @param {string} paramName - nombre del parámetro (default: "id")
 */
export const validateIdParam = (paramName = "id") => {
  return (req, res, next) => {
    const raw = req.params[paramName];

    if (raw === undefined || raw === null || raw === "") {
      return res.status(400).json({ error: `Falta el parámetro ${paramName}` });
    }

    const num = Number(raw);

    if (!Number.isInteger(num) || num <= 0) {
      return res.status(400).json({
        error: `El parámetro ${paramName} debe ser un entero positivo`,
      });
    }

    req.params[paramName] = num;
    next();
  };
};

/**
 * Parsea los parámetros de paginación estándar: page, limit.
 * Inyecta en req.pagination: { page, limit, offset }.
 * Defaults: page=1, limit=50. Máximo limit=200.
 */
export const parsePagination = (req, res, next) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const rawLimit = Number(req.query.limit) || 50;
  const limit = Math.min(200, Math.max(1, rawLimit));
  const offset = (page - 1) * limit;

  req.pagination = { page, limit, offset };
  next();
};
