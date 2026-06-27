import { createHash, randomBytes } from "crypto";
import type { WorkspaceRole } from "@prisma/client";
import { z } from "zod";
import { config } from "../config";
import { prisma } from "../prisma";
import { HttpError } from "../utils/errors";

const assignableRoles = ["admin", "editor", "viewer"] as const;
const memberRoles = ["owner", "admin", "editor", "viewer"] as const;

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  timezone: z.string().min(1).max(80).default("Asia/Shanghai")
});

export const createInvitationSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  role: z.enum(assignableRoles).default("viewer")
});

export const updateMemberSchema = z.object({
  role: z.enum(assignableRoles).optional(),
  status: z.enum(["active", "disabled"]).optional()
});

function slugify(name: string) {
  const base = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${base || "workspace"}-${Date.now()}`;
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newInviteToken() {
  return randomBytes(32).toString("base64url");
}

function assertRoleCanManageMembers(role: WorkspaceRole) {
  if (role !== "owner" && role !== "admin") {
    throw new HttpError(403, "Only workspace owners and admins can manage members");
  }
}

export async function getMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspaceId,
      status: "active"
    }
  });
}

export async function requireWorkspaceMembership(userId: string, workspaceId: string) {
  const membership = await getMembership(userId, workspaceId);

  if (!membership) {
    throw new HttpError(403, "You do not have access to this workspace");
  }

  return membership;
}

export async function requireWorkspaceManager(userId: string, workspaceId: string) {
  const membership = await requireWorkspaceMembership(userId, workspaceId);
  assertRoleCanManageMembers(membership.role);
  return membership;
}

export async function createWorkspace(userId: string, input: z.infer<typeof createWorkspaceSchema>) {
  const workspace = await prisma.workspace.create({
    data: {
      name: input.name,
      slug: slugify(input.name),
      timezone: input.timezone,
      ownerId: userId,
      members: {
        create: {
          userId,
          role: "owner",
          status: "active"
        }
      }
    }
  });

  return workspace;
}

export async function listWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId,
      status: "active"
    },
    include: {
      workspace: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  return memberships.map((membership) => ({
    id: membership.workspace.id,
    name: membership.workspace.name,
    slug: membership.workspace.slug,
    timezone: membership.workspace.timezone,
    plan: membership.workspace.plan,
    role: membership.role
  }));
}

export async function getWorkspace(userId: string, workspaceId: string) {
  const membership = await requireWorkspaceMembership(userId, workspaceId);
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId }
  });

  if (!workspace) {
    throw new HttpError(404, "Workspace not found");
  }

  return {
    ...workspace,
    role: membership.role
  };
}

export async function listMembers(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(userId, workspaceId);

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  return members.map((member) => ({
    id: member.id,
    userId: member.userId,
    email: member.user.email,
    name: member.user.name,
    role: member.role,
    status: member.status,
    createdAt: member.createdAt
  }));
}

export async function updateMember(
  actorId: string,
  workspaceId: string,
  memberId: string,
  input: z.infer<typeof updateMemberSchema>
) {
  await requireWorkspaceManager(actorId, workspaceId);

  const member = await prisma.workspaceMember.findFirst({
    where: {
      id: memberId,
      workspaceId
    }
  });

  if (!member) {
    throw new HttpError(404, "Member not found");
  }

  if (member.role === "owner") {
    throw new HttpError(400, "Workspace owner cannot be changed through this endpoint");
  }

  if (!input.role && !input.status) {
    throw new HttpError(400, "Nothing to update");
  }

  return prisma.workspaceMember.update({
    where: { id: member.id },
    data: {
      role: input.role,
      status: input.status
    }
  });
}

export async function listInvitations(userId: string, workspaceId: string) {
  await requireWorkspaceManager(userId, workspaceId);

  return prisma.workspaceInvitation.findMany({
    where: { workspaceId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      createdAt: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function createInvitation(
  actorId: string,
  workspaceId: string,
  input: z.infer<typeof createInvitationSchema>
) {
  await requireWorkspaceManager(actorId, workspaceId);

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId }
  });

  if (!workspace) {
    throw new HttpError(404, "Workspace not found");
  }

  const existingMember = await prisma.user.findUnique({
    where: { email: input.email },
    include: {
      memberships: {
        where: {
          workspaceId,
          status: "active"
        }
      }
    }
  });

  if (existingMember?.memberships.length) {
    throw new HttpError(409, "User is already a member of this workspace");
  }

  const token = newInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.workspaceInvitation.updateMany({
    where: {
      workspaceId,
      email: input.email,
      status: "pending"
    },
    data: {
      status: "revoked"
    }
  });

  const invitation = await prisma.workspaceInvitation.create({
    data: {
      workspaceId,
      email: input.email,
      role: input.role,
      tokenHash,
      invitedById: actorId,
      expiresAt
    },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      createdAt: true
    }
  });

  return {
    ...invitation,
    inviteUrl: `${config.WEB_APP_URL}/invitations/${token}`,
    token
  };
}

export async function revokeInvitation(actorId: string, workspaceId: string, invitationId: string) {
  await requireWorkspaceManager(actorId, workspaceId);

  const invitation = await prisma.workspaceInvitation.findFirst({
    where: {
      id: invitationId,
      workspaceId
    }
  });

  if (!invitation) {
    throw new HttpError(404, "Invitation not found");
  }

  return prisma.workspaceInvitation.update({
    where: { id: invitation.id },
    data: {
      status: "revoked"
    },
    select: {
      id: true,
      email: true,
      role: true,
      status: true
    }
  });
}

export async function getInvitation(token: string) {
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: {
      tokenHash: hashInviteToken(token)
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });

  if (!invitation) {
    throw new HttpError(404, "Invitation not found");
  }

  const computedStatus =
    invitation.status === "pending" && invitation.expiresAt <= new Date()
      ? "expired"
      : invitation.status;

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: computedStatus,
    expiresAt: invitation.expiresAt,
    workspace: invitation.workspace
  };
}

export async function acceptInvitation(userId: string, token: string) {
  const tokenHash = hashInviteToken(token);

  return prisma.$transaction(async (tx) => {
    const invitation = await tx.workspaceInvitation.findUnique({
      where: { tokenHash },
      include: {
        workspace: true
      }
    });

    if (!invitation) {
      throw new HttpError(404, "Invitation not found");
    }

    if (invitation.status !== "pending") {
      throw new HttpError(400, "Invitation is no longer active");
    }

    if (invitation.expiresAt <= new Date()) {
      await tx.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: "expired" }
      });
      throw new HttpError(400, "Invitation has expired");
    }

    const user = await tx.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new HttpError(403, "This invitation was sent to a different email address");
    }

    const membership = await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invitation.workspaceId,
          userId
        }
      },
      create: {
        workspaceId: invitation.workspaceId,
        userId,
        role: invitation.role,
        status: "active"
      },
      update: {
        role: invitation.role,
        status: "active"
      }
    });

    await tx.workspaceInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "accepted",
        acceptedById: userId,
        acceptedAt: new Date()
      }
    });

    return {
      workspace: {
        id: invitation.workspace.id,
        name: invitation.workspace.name,
        slug: invitation.workspace.slug
      },
      membership: {
        id: membership.id,
        role: membership.role,
        status: membership.status
      }
    };
  });
}

export const exposedMemberRoles = memberRoles;
