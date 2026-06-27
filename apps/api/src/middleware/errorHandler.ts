import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/errors";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.path}`));
}

export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "ValidationError",
      message: "Request validation failed",
      details: error.flatten()
    });
  }

  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({
      error: "HttpError",
      message: error.message,
      details: error.details
    });
  }

  console.error(error);
  return res.status(500).json({
    error: "InternalServerError",
    message: "Unexpected server error"
  });
}
