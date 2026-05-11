import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { tApi } from "../i18n/apiMessages.js";
import { resolveApiLocale } from "../utils/apiLocale.js";

const localizedHandler = (key) => (req, res, _next, options) => {
  return res.status(options.statusCode).json({
    error: tApi(resolveApiLocale(req), key),
  });
};

export const loginRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_LOGIN_WINDOW_MIN * 60 * 1000,
  max: env.RATE_LIMIT_LOGIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: localizedHandler("auth.tooManyLoginAttempts"),
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: localizedHandler("auth.tooManyAuthRequests"),
});

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  handler: localizedHandler("common.tooManyRequests"),
});
