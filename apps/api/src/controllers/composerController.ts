import type { Request, Response } from "express";
import {
  createComposerPost,
  createComposerPostSchema,
  getComposerPlatforms,
  getComposerPost,
  listComposerPosts,
  listWorkspaceMedia,
  uploadWorkspaceImage
} from "../services/composerService";

export async function getComposerPlatformsController(_req: Request, res: Response) {
  return res.json(getComposerPlatforms());
}

export async function uploadWorkspaceImageController(req: Request, res: Response) {
  const asset = await uploadWorkspaceImage(
    req.user!.id,
    req.params.workspaceId,
    req.file as Express.Multer.File
  );
  return res.status(201).json(asset);
}

export async function listWorkspaceMediaController(req: Request, res: Response) {
  const media = await listWorkspaceMedia(req.user!.id, req.params.workspaceId);
  return res.json(media);
}

export async function createComposerPostController(req: Request, res: Response) {
  const body = createComposerPostSchema.parse(req.body);
  const post = await createComposerPost(req.user!.id, req.params.workspaceId, body);
  return res.status(201).json(post);
}

export async function listComposerPostsController(req: Request, res: Response) {
  const posts = await listComposerPosts(req.user!.id, req.params.workspaceId);
  return res.json(posts);
}

export async function getComposerPostController(req: Request, res: Response) {
  const post = await getComposerPost(req.user!.id, req.params.workspaceId, req.params.postId);
  return res.json(post);
}
