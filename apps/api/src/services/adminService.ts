import { config } from "../config";
import { prisma } from "../prisma";
import { HttpError } from "../utils/errors";

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
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
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
