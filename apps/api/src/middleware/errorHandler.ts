import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { maxMediaUploadMegabytes } from "./upload";
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
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "UploadTooLarge",
      message: `单个图片或视频不能超过 ${maxMediaUploadMegabytes} MB`
    });
  }

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

  if ((error as NodeJS.ErrnoException).code === "ENOSPC") {
    return res.status(507).json({
      error: "StorageFull",
      message: "服务器存储空间不足，请稍后重试"
    });
  }

  console.error(error);
  return res.status(500).json({
    error: "InternalServerError",
    message: "Unexpected server error"
  });
}
