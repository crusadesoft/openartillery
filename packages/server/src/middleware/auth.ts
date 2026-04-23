import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifyAccessToken } from "../auth/jwt.js";

export interface AuthedRequest extends Request {
  auth: { userId: string; username: string };
}

export function requireAuth(): RequestHandler {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "missing_token" });
      return;
    }
    try {
      const claims = await verifyAccessToken(header.slice(7));
      (req as AuthedRequest).auth = {
        userId: claims.sub,
        username: claims.username,
      };
      next();
    } catch {
      res.status(401).json({ error: "invalid_token" });
    }
  };
}

export function optionalAuth(): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      try {
        const claims = await verifyAccessToken(header.slice(7));
        (req as AuthedRequest).auth = {
          userId: claims.sub,
          username: claims.username,
        };
      } catch {
        // ignore — treat as anonymous
      }
    }
    next();
  };
}
