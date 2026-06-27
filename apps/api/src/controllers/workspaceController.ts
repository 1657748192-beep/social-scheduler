import type { Request, Response } from "express";
import {
  acceptInvitation,
  createInvitation,
  createInvitationSchema,
  createWorkspace,
  createWorkspaceSchema,
  getInvitation,
  getWorkspace,
  listInvitations,
  listMembers,
  listWorkspaces,
  revokeInvitation,
  updateMember,
  updateMemberSchema
} from "../services/workspaceService";

export async function createWorkspaceController(req: Request, res: Response) {
  const body = createWorkspaceSchema.parse(req.body);
  const workspace = await createWorkspace(req.user!.id, body);
  return res.status(201).json(workspace);
}

export async function listWorkspacesController(req: Request, res: Response) {
  const workspaces = await listWorkspaces(req.user!.id);
  return res.json(workspaces);
}

export async function getWorkspaceController(req: Request, res: Response) {
  const workspace = await getWorkspace(req.user!.id, req.params.workspaceId);
  return res.json(workspace);
}

export async function listMembersController(req: Request, res: Response) {
  const members = await listMembers(req.user!.id, req.params.workspaceId);
  return res.json(members);
}

export async function updateMemberController(req: Request, res: Response) {
  const body = updateMemberSchema.parse(req.body);
  const member = await updateMember(req.user!.id, req.params.workspaceId, req.params.memberId, body);
  return res.json(member);
}

export async function listInvitationsController(req: Request, res: Response) {
  const invitations = await listInvitations(req.user!.id, req.params.workspaceId);
  return res.json(invitations);
}

export async function createInvitationController(req: Request, res: Response) {
  const body = createInvitationSchema.parse(req.body);
  const invitation = await createInvitation(req.user!.id, req.params.workspaceId, body);
  return res.status(201).json(invitation);
}

export async function revokeInvitationController(req: Request, res: Response) {
  const invitation = await revokeInvitation(
    req.user!.id,
    req.params.workspaceId,
    req.params.invitationId
  );
  return res.json(invitation);
}

export async function getInvitationController(req: Request, res: Response) {
  const invitation = await getInvitation(req.params.token);
  return res.json(invitation);
}

export async function acceptInvitationController(req: Request, res: Response) {
  const result = await acceptInvitation(req.user!.id, req.params.token);
  return res.json(result);
}
