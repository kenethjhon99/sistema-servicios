import { apiError } from "../i18n/apiMessages.js";

/**
 * Validates that a route parameter is a positive integer.
 */
export const validateIdParam = (paramName = "id") => {
  return (req, res, next) => {
    const raw = req.params[paramName];

    if (raw === undefined || raw === null || raw === "") {
      return apiError(res, req, 400, "common.missingParam", { paramName });
    }

    const num = Number(raw);

    if (!Number.isInteger(num) || num <= 0) {
      return apiError(res, req, 400, "common.invalidPositiveIntParam", { paramName });
    }

    req.params[paramName] = num;
    next();
  };
};

/**
 * Parses standard pagination query params.
 */
export const parsePagination = (req, _res, next) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const rawLimit = Number(req.query.limit) || 50;
  const limit = Math.min(200, Math.max(1, rawLimit));
  const offset = (page - 1) * limit;

  req.pagination = { page, limit, offset };
  next();
};
