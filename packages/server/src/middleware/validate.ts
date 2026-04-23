import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodSchema, ZodError } from "zod";

export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "validation_failed",
        details: flattenZod(result.error),
      });
    }
    (req as Request & { validated: T }).validated = result.data;
    next();
  };
}

function flattenZod(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const path = issue.path.join(".") || "_";
    (out[path] ??= []).push(issue.message);
  }
  return out;
}

export function getValidated<T>(req: Request): T {
  return (req as Request & { validated: T }).validated;
}
