import type { WorkspaceRole } from "@prisma/client";
import { z } from "zod";
import { config } from "../config";
import {
  composerPlatformLimits,
  getComposerPlatformLimit,
  type ComposerPlatform
} from "../config/platformLimits";
import { prisma } from "../prisma";
import { HttpError } from "../utils/errors";
import { enqueuePublishJobs } from "./scheduleService";
import { requireWorkspaceMembership } from "./workspaceService";

const writableRoles: WorkspaceRole[] = ["owner", "admin", "editor"];

const variantSchema = z.object({
  platform: z.enum(["x", "instagram", "facebook"]),
  text: z.string().default(""),
  mediaAssetIds: z.array(z.string().uuid()).default([])
});

export const createComposerPostSchema = z.object({
  title: z.string().max(120).optional(),
  baseText: z.string().min(1).max(63206),
  variants: z.array(variantSchema).min(1).max(3),
  scheduledAt: z.string().datetime().optional()
});

export const updateComposerPostSchema = createComposerPostSchema.partial().extend({
  variants: z.array(variantSchema).min(1).max(3).optional()
});

export function getComposerPlatforms() {
  return Object.values(composerPlatformLimits);
}

function ensureCanWrite(role: WorkspaceRole) {
  if (!writableRoles.includes(role)) {
    throw new HttpError(403, "Viewer role cannot create or edit content");
  }
}

function validateVariant(platform: ComposerPlatform, text: string, mediaCount: number) {
  const limit = getComposerPlatformLimit(platform);
  const errors: Array<{ code: string; message: string; limit: number; actual: number }> = [];

  if (text.length > limit.maxTextLength) {
    errors.push({
      code: "text_too_long",
      message: `${limit.label} text is over the ${limit.maxTextLength} character limit`,
      limit: limit.maxTextLength,
      actual: text.length
    });
  }

  if (mediaCount > limit.maxImages) {
    errors.push({
      code: "too_many_images",
      message: `${limit.label} allows up to ${limit.maxImages} media assets`,
      limit: limit.maxImages,
      actual: mediaCount
    });
  }

  return errors;
}

async function assertMediaBelongsToWorkspace(workspaceId: string, mediaAssetIds: string[]) {
  const uniqueIds = Array.from(new Set(mediaAssetIds));

  if (!uniqueIds.length) {
    return;
  }

  const count = await prisma.mediaAsset.count({
    where: {
      id: {
        in: uniqueIds
      },
      workspaceId,
      status: "ready"
    }
  });

  if (count !== uniqueIds.length) {
    throw new HttpError(400, "One or more media assets are invalid for this workspace");
  }
}

export async function createComposerPost(
  userId: string,
  workspaceId: string,
  input: z.infer<typeof createComposerPostSchema>
) {
  const membership = await requireWorkspaceMembership(userId, workspaceId);
  ensureCanWrite(membership.role);

  const allMediaIds = input.variants.flatMap((variant) => variant.mediaAssetIds);
  await assertMediaBelongsToWorkspace(workspaceId, allMediaIds);

  const validationErrors = input.variants.flatMap((variant) =>
    validateVariant(variant.platform, variant.text, variant.mediaAssetIds.length).map((error) => ({
      platform: variant.platform,
      ...error
    }))
  );

  if (input.scheduledAt && validationErrors.length) {
    throw new HttpError(400, "Cannot schedule a post with platform validation errors", validationErrors);
  }

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;

  if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
    throw new HttpError(400, "scheduledAt must be in the future");
  }

  const publishJobsToQueue: Array<{ id: string; scheduledAt: Date }> = [];

  const post = await prisma.$transaction(async (tx) => {
    const createdPost = await tx.post.create({
      data: {
        workspaceId,
        authorId: userId,
        title: input.title,
        baseText: input.baseText,
        workflowStatus: scheduledAt ? "scheduled" : "draft"
      }
    });

    for (const variant of input.variants) {
      const errors = validateVariant(variant.platform, variant.text, variant.mediaAssetIds.length);
      const createdVariant = await tx.postVariant.create({
        data: {
          postId: createdPost.id,
          platform: variant.platform,
          text: variant.text,
          validationErrors: errors,
          publishStatus: scheduledAt ? "queued" : "draft"
        }
      });

      if (variant.mediaAssetIds.length) {
        await tx.postVariantMedia.createMany({
          data: variant.mediaAssetIds.map((mediaAssetId, index) => ({
            postVariantId: createdVariant.id,
            mediaAssetId,
            sortOrder: index
          }))
        });
      }

      if (scheduledAt) {
        const schedule = await tx.schedule.create({
          data: {
            postVariantId: createdVariant.id,
            workspaceId,
            scheduledAt,
            timezone: "Asia/Shanghai",
            status: "scheduled",
            createdBy: userId
          }
        });

        const publishJob = await tx.publishJob.create({
          data: {
            scheduleId: schedule.id,
            postVariantId: createdVariant.id,
            workspaceId,
            status: "waiting",
            idempotencyKey: `${schedule.id}:${createdVariant.id}`
          }
        });

        publishJobsToQueue.push({
          id: publishJob.id,
          scheduledAt
        });
      }
    }

    return tx.post.findUniqueOrThrow({
      where: { id: createdPost.id },
      include: {
        variants: {
          include: {
            media: {
              include: {
                mediaAsset: true
              },
              orderBy: {
                sortOrder: "asc"
              }
            },
            schedules: true
          }
        }
      }
    });
  });

  await enqueuePublishJobs(publishJobsToQueue);

  return post;
}

export async function listComposerPosts(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(userId, workspaceId);

  return prisma.post.findMany({
    where: {
      workspaceId
    },
    include: {
      variants: {
        include: {
          media: {
            include: {
              mediaAsset: true
            },
            orderBy: {
              sortOrder: "asc"
            }
          },
          schedules: true
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: 50
  });
}

export async function getComposerPost(userId: string, workspaceId: string, postId: string) {
  await requireWorkspaceMembership(userId, workspaceId);

  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      workspaceId
    },
    include: {
      variants: {
        include: {
          media: {
            include: {
              mediaAsset: true
            },
            orderBy: {
              sortOrder: "asc"
            }
          },
          schedules: true
        }
      }
    }
  });

  if (!post) {
    throw new HttpError(404, "Post not found");
  }

  return post;
}

export async function uploadWorkspaceMedia(
  userId: string,
  workspaceId: string,
  file: Express.Multer.File
) {
  const membership = await requireWorkspaceMembership(userId, workspaceId);
  ensureCanWrite(membership.role);

  if (!file) {
    throw new HttpError(400, "Media file is required");
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      workspaceId,
      uploadedBy: userId,
      fileUrl: `${config.API_PUBLIC_URL}/uploads/${file.filename}`,
      storageKey: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      metadata: {
        originalName: file.originalname
      }
    }
  });

  return asset;
}

export async function listWorkspaceMedia(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(userId, workspaceId);

  return prisma.mediaAsset.findMany({
    where: {
      workspaceId,
      status: "ready"
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 100
  });
}
