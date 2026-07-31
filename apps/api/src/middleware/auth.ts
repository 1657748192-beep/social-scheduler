import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config, LOGIN_SESSION_MAX_AGE_MS } from "../config";
import { prisma } from "../prisma";
import { HttpError } from "../utils/errors";

type JwtPayload = {
  sub: string;
  email: string;
  sid: string;
  jti: string;
  iat?: number;
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

  // Existing tokens may have been created before the 24-hour policy was
  // enabled. Checking their issue time prevents those older, longer-lived
  // tokens from remaining usable until their legacy expiry date.
  if (!payload.iat || payload.iat * 1000 + LOGIN_SESSION_MAX_AGE_MS <= Date.now()) {
    return next(new HttpError(401, "Login session has expired. Please sign in again."));
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

    if (
      !session ||
      session.createdAt.getTime() + LOGIN_SESSION_MAX_AGE_MS <= Date.now()
    ) {
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
