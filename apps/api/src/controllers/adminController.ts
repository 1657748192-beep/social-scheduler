import type { Request, Response } from "express";
import { listAdminUsers } from "../services/adminService";

export async function listAdminUsersController(req: Request, res: Response) {
  const result = await listAdminUsers(req.user!.email);
  return res.json(result);
}
