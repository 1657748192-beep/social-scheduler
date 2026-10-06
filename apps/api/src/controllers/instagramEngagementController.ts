import type { Request, Response } from "express";
import { z } from "zod";
import { instagramEngagementService } from "../services/instagramEngagementService";

const paginationSchema = z.object({
  after: z.string().trim().min(1).max(8192).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional()
});
const replySchema = z.object({ message: z.string().trim().min(1).max(2000) });
const commentReplySchema = replySchema.extend({ commentId: z.string().trim().min(1).max(200) });
const recoverAccountSchema = z.object({ socialAccountId: z.string().trim().min(1).max(200) });
export async function getInstagramReceptionController(req: Request, res: Response) {
  return res.json(await instagramEngagementService.getReceptionStatus(req.user!.id, req.params.workspaceId, req.params.socialAccountId));
}

export async function recoverLegacyInstagramPostAccountController(req: Request, res: Response) {
  const body = recoverAccountSchema.parse(req.body);
  const data = await instagramEngagementService.recoverLegacyPostAccount(
    req.user!.id, req.params.workspaceId, req.params.scheduleId, body.socialAccountId
  );
  return res.json(data);
}

export async function getInstagramPostMetricsController(req: Request, res: Response) {
  const data = await instagramEngagementService.getPostMetrics(req.user!.id, req.params.workspaceId, req.params.scheduleId);
  return res.json(data);
}

export async function listInstagramPostCommentsController(req: Request, res: Response) {
  const query = paginationSchema.parse(req.query);
  const data = await instagramEngagementService.listComments(req.user!.id, req.params.workspaceId, req.params.scheduleId, query);
  return res.json(data);
}

export async function replyToInstagramPostCommentController(req: Request, res: Response) {
  const body = commentReplySchema.parse(req.body);
  const data = await instagramEngagementService.replyToComment(
    req.user!.id, req.params.workspaceId, req.params.scheduleId, body.commentId, body.message
  );
  return res.json(data);
}

export async function sendInstagramPrivateReplyController(req: Request, res: Response) {
  const body = commentReplySchema.parse(req.body);
  const data = await instagramEngagementService.sendPrivateReply(
    req.user!.id, req.params.workspaceId, req.params.scheduleId, body.commentId, body.message
  );
  return res.json(data);
}

export async function listInstagramConversationsController(req: Request, res: Response) {
  const query = paginationSchema.parse(req.query);
  const data = await instagramEngagementService.listConversations(
    req.user!.id, req.params.workspaceId, req.params.socialAccountId, query
  );
  return res.json(data);
}

export async function listInstagramMessagesController(req: Request, res: Response) {
  const query = paginationSchema.parse(req.query);
  const data = await instagramEngagementService.listMessages(
    req.user!.id, req.params.workspaceId, req.params.socialAccountId, req.params.conversationId, query
  );
  return res.json(data);
}

export async function replyToInstagramConversationController(req: Request, res: Response) {
  const body = replySchema.parse(req.body);
  const data = await instagramEngagementService.replyToConversation(
    req.user!.id, req.params.workspaceId, req.params.socialAccountId, req.params.conversationId, body.message
  );
  return res.json(data);
}
