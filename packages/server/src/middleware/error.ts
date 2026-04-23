import type { Request, Response, NextFunction, ErrorRequestHandler, RequestHandler } from "express";
import { logger } from "../logger.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "http_error",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({ error: "not_found" });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const reqId = (req as Request & { id?: string }).id;
  if (err instanceof HttpError) {
    res
      .status(err.status)
      .json({ error: err.code, message: err.message, details: err.details });
    return;
  }
  logger.error({ err, reqId }, "unhandled error");
  res.status(500).json({ error: "internal_error" });
};

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void | Response> | void;

export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
