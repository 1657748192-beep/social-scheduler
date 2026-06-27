import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../prisma";
import { HttpError } from "../utils/errors";

type JwtPayload = {
  sub: string;
  email: string;
  sid: string;
  jti: string;
};

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    return next(new HttpError(401, "Missing bearer token"));
  }

  let payload: JwtPayload;

  try {
    payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
  } catch {
    return next(new HttpError(401, "Invalid or expired token"));
  }

  if (!payload.sub || !payload.sid || !payload.jti) {
    return next(new HttpError(401, "Invalid token payload"));
  }

  try {
    const session = await prisma.userSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        tokenId: payload.jti,
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (!session) {
      return next(new HttpError(401, "Session is expired or revoked"));
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      sessionId: payload.sid
    };
    return next();
  } catch (error) {
    return next(error);
  }
}
