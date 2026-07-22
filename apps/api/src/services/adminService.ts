import { config } from "../config";
import { prisma } from "../prisma";
import { publishQueue } from "../queues/publishQueue";
import { deleteStoredMedia } from "./mediaStorageService";
import { HttpError } from "../utils/errors";
import { z } from "zod";

export const updateAdminPublishingAccessSchema = z
  .object({
    publishingAccessDisabled: z.boolean().optional(),
    publishingAccessExpiresAt: z.string().datetime({ offset: true }).nullable().optional()
  })
  .refine(
    (value) =>
      value.publishingAccessDisabled !== undefined || value.publishingAccessExpiresAt !== undefined,
    {
      message: "Provide a status or expiry time"
    }
  )
  .refine(
    (value) =>
      !value.publishingAccessExpiresAt || new Date(value.publishingAccessExpiresAt).getTime() > Date.now(),
    "The expiry time must be in the future"
  );

function configuredAdminEmails() {
  return new Set(
    config.ADMIN_EMAILS.split(/[,\s]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function assertAdmin(email: string) {
  const adminEmails = configuredAdminEmails();

  if (!adminEmails.size || !adminEmails.has(email.toLowerCase())) {
    throw new HttpError(403, "Only system administrators can access this page");
  }
}

export async function listAdminUsers(requesterEmail: string) {
  assertAdmin(requesterEmail);

  const users = await prisma.user.findMany({
    orderBy: {
      createdAt: "desc"
    },
    include: {
      memberships: {
        include: {
          workspace: {
            include: {
              socialAccounts: {
                orderBy: {
                  createdAt: "desc"
                },
                select: {
                  id: true,
                  platform: true,
                  displayName: true,
                  accountType: true,
                  status: true,
                  createdAt: true
                }
              },
              _count: {
                select: {
                  members: true,
                  posts: true,
                  socialAccounts: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      },
      _count: {
        select: {
          memberships: true,
          posts: true,
          sessions: true,
          uploadedMedia: true
        }
      }
    }
  });

  const userIds = users.map((user) => user.id);
  const sessions = userIds.length
    ? await prisma.userSession.findMany({
        where: {
          userId: {
            in: userIds
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      })
    : [];
  type AdminSession = (typeof sessions)[number];
  const sessionsByUserId = new Map<string, AdminSession[]>();

  for (const session of sessions) {
    sessionsByUserId.set(session.userId, [...(sessionsByUserId.get(session.userId) ?? []), session]);
  }

  const now = new Date();

  return {
    generatedAt: now,
    users: users.map((user) => {
      const userSessions = sessionsByUserId.get(user.id) ?? [];
      const activeSessions = userSessions.filter(
        (session) => !session.revokedAt && session.expiresAt.getTime() > now.getTime()
      );
      const latestSession = userSessions[0];

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        isSystemAdmin: configuredAdminEmails().has(user.email.toLowerCase()),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        publishingAccessExpiresAt: user.publishingAccessExpiresAt,
        publishingAccessStatus: user.publishingAccessDisabled
          ? "disabled"
          : user.publishingAccessExpiresAt && user.publishingAccessExpiresAt.getTime() <= now.getTime()
            ? "expired"
            : "active",
        password: {
          storedAs: "bcrypt_hash",
          viewable: false,
          note: "\u5bc6\u7801\u5df2\u52a0\u5bc6\u4fdd\u5b58\uff0c\u7ba1\u7406\u5458\u4e0d\u80fd\u67e5\u770b\u539f\u5bc6\u7801\uff0c\u53ea\u80fd\u901a\u8fc7\u91cd\u7f6e\u5bc6\u7801\u4fee\u6539\u3002"
        },
        sessionSummary: {
          totalSessions: user._count.sessions,
          activeSessions: activeSessions.length,
          latestSessionCreatedAt: latestSession?.createdAt ?? null,
          latestSessionExpiresAt: latestSession?.expiresAt ?? null,
          latestSessionRevokedAt: latestSession?.revokedAt ?? null
        },
        stats: {
          workspaceMemberships: user._count.memberships,
          authoredPosts: user._count.posts,
          uploadedMedia: user._count.uploadedMedia
        },
        workspaces: user.memberships.map((membership) => ({
          id: membership.workspace.id,
          name: membership.workspace.name,
          slug: membership.workspace.slug,
          role: membership.role,
          status: membership.status,
          plan: membership.workspace.plan,
          joinedAt: membership.createdAt,
          memberCount: membership.workspace._count.members,
          postCount: membership.workspace._count.posts,
          socialAccountCount: membership.workspace._count.socialAccounts,
          socialAccounts: membership.workspace.socialAccounts.map((account) => ({
            id: account.id,
            platform: account.platform,
            displayName: account.displayName,
            accountType: account.accountType,
            status: account.status,
            createdAt: account.createdAt
          }))
        }))
      };
    })
  };
}

export async function updateAdminPublishingAccess(
  requesterEmail: string,
  userId: string,
  input: z.infer<typeof updateAdminPublishingAccessSchema>
) {
  assertAdmin(requesterEmail);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true
    }
  });

  if (!user) {
    throw new HttpError(404, "User not found");
  }

  if (configuredAdminEmails().has(user.email.toLowerCase())) {
    throw new HttpError(400, "System administrators cannot be limited here");
  }

  return prisma.user.update({
    where: { id: user.id },
    data: {
      ...(input.publishingAccessDisabled !== undefined
        ? { publishingAccessDisabled: input.publishingAccessDisabled }
        : {}),
      ...(input.publishingAccessExpiresAt !== undefined
        ? {
            publishingAccessExpiresAt: input.publishingAccessExpiresAt
              ? new Date(input.publishingAccessExpiresAt)
              : null
          }
        : {})
    },
    select: {
      id: true,
      publishingAccessDisabled: true,
      publishingAccessExpiresAt: true
    }
  });
}

async function removeQueuedPublishJobs(publishJobIds: string[]) {
  await Promise.all(
    publishJobIds.map(async (publishJobId) => {
      const queueJob = await publishQueue.getJob(publishJobId);
      await queueJob?.remove().catch(() => undefined);
    })
  );
}

export async function deleteAdminUser(requesterEmail: string, userId: string) {
  assertAdmin(requesterEmail);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      ownedSpaces: {
        select: { id: true }
      }
    }
  });

  if (!user) {
    throw new HttpError(404, "User not found");
  }

  if (configuredAdminEmails().has(user.email.toLowerCase())) {
    throw new HttpError(400, "System administrators cannot be deleted here");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { publishingAccessDisabled: true }
  });

  const ownedWorkspaceIds = user.ownedSpaces.map((workspace) => workspace.id);
  const [mediaAssets, schedules] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: {
        OR: [
          { uploadedBy: user.id },
          ...(ownedWorkspaceIds.length ? [{ workspaceId: { in: ownedWorkspaceIds } }] : [])
        ]
      },
      select: {
        id: true,
        fileUrl: true,
        storageKey: true
      }
    }),
    prisma.schedule.findMany({
      where: {
        OR: [
          { createdBy: user.id },
          { postVariant: { post: { authorId: user.id } } },
          ...(ownedWorkspaceIds.length ? [{ workspaceId: { in: ownedWorkspaceIds } }] : [])
        ]
      },
      select: {
        id: true,
        publishJobs: {
          select: {
            id: true,
            status: true
          }
        }
      }
    })
  ]);

  const activePublishJob = schedules
    .flatMap((schedule) => schedule.publishJobs)
    .find((job) => job.status === "active");

  if (activePublishJob) {
    throw new HttpError(409, "This user has content that is currently publishing. Try again in a moment.");
  }

  await removeQueuedPublishJobs(schedules.flatMap((schedule) => schedule.publishJobs.map((job) => job.id)));
  await Promise.all(mediaAssets.map((asset) => deleteStoredMedia(asset)));

  await prisma.$transaction(async (tx) => {
    await tx.workspaceInvitation.deleteMany({
      where: {
        OR: [{ invitedById: user.id }, { acceptedById: user.id }]
      }
    });
    await tx.oauthAuthorizationLink.deleteMany({
      where: { createdById: user.id }
    });
    await tx.post.deleteMany({
      where: { authorId: user.id }
    });
    await tx.mediaAsset.deleteMany({
      where: {
        OR: [
          { uploadedBy: user.id },
          ...(ownedWorkspaceIds.length ? [{ workspaceId: { in: ownedWorkspaceIds } }] : [])
        ]
      }
    });
    await tx.schedule.deleteMany({
      where: { createdBy: user.id }
    });
    if (ownedWorkspaceIds.length) {
      await tx.workspace.deleteMany({
        where: { id: { in: ownedWorkspaceIds } }
      });
    }
    await tx.user.delete({
      where: { id: user.id }
    });
  });

  return { ok: true, deletedUserId: user.id };
}
