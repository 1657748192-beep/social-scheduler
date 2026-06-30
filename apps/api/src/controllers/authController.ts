import type { Request, Response } from "express";
import {
  confirmPasswordReset,
  confirmPasswordResetSchema,
  getCurrentUser,
  login,
  loginSchema,
  logout,
  register,
  registerSchema,
  requestPasswordReset,
  requestPasswordResetSchema
} from "../services/authService";

export async function registerController(req: Request, res: Response) {
  const body = registerSchema.parse(req.body);
  const result = await register(body);
  return res.status(201).json(result);
}

export async function loginController(req: Request, res: Response) {
  const body = loginSchema.parse(req.body);
  const result = await login(body);
  return res.json(result);
}

export async function requestPasswordResetController(req: Request, res: Response) {
  const body = requestPasswordResetSchema.parse(req.body);
  const result = await requestPasswordReset(body);
  return res.json(result);
}

export async function confirmPasswordResetController(req: Request, res: Response) {
  const body = confirmPasswordResetSchema.parse(req.body);
  const result = await confirmPasswordReset(body);
  return res.json(result);
}

export async function meController(req: Request, res: Response) {
  const result = await getCurrentUser(req.user!.id);
  return res.json(result);
}

export async function logoutController(req: Request, res: Response) {
  const result = await logout(req.user!.sessionId);
  return res.json(result);
}
