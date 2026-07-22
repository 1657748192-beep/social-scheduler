import type { Request, Response } from "express";
import {
  deleteAdminUser,
  listAdminUsers,
  updateAdminPublishingAccess,
  updateAdminPublishingAccessSchema
} from "../services/adminService";

export async function listAdminUsersController(req: Request, res: Response) {
  const result = await listAdminUsers(req.user!.email);
  return res.json(result);
}

export async function updateAdminPublishingAccessController(req: Request, res: Response) {
  const body = updateAdminPublishingAccessSchema.parse(req.body);
  const user = await updateAdminPublishingAccess(req.user!.email, req.params.userId, body);
  return res.json(user);
}

export async function deleteAdminUserController(req: Request, res: Response) {
  const result = await deleteAdminUser(req.user!.email, req.params.userId);
  return res.json(result);
}
