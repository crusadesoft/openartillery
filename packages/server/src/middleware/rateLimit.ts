import rateLimit from "express-rate-limit";
import { config } from "../config.js";

export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.AUTH_RATE_LIMIT_PER_MIN,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "rate_limited", scope: "auth" },
});

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.API_RATE_LIMIT_PER_MIN,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "rate_limited", scope: "api" },
});
