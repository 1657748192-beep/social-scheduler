import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config";
import { prisma } from "../prisma";
import { HttpError } from "../utils/errors";

export const registerSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
  name: z.string().min(1).max(80)
});

export const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1)
});

function parseDurationMs(duration: string) {
  const match = /^(\d+)([smhd])$/.exec(duration);

  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }

  const value = Number(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return value * multipliers[unit];
}

async function createSessionAndToken(user: { id: string; email: string }) {
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + parseDurationMs(config.JWT_EXPIRES_IN));

  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      tokenId,
      expiresAt
    }
  });

  const token = signToken(user, session.id, tokenId);

  return {
    token,
    expiresAt
  };
}

function signToken(user: { id: string; email: string }, sessionId: string, tokenId: string) {
  return jwt.sign(
    {
      email: user.email,
      sid: sessionId
    },
    config.JWT_SECRET,
    {
      subject: user.id,
      jwtid: tokenId,
      expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
    }
  );
}

function workspaceSlugFromEmail(email: string) {
  const prefix = email.split("@")[0].replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `${prefix}-${Date.now()}`;
}

export async function register(input: z.infer<typeof registerSchema>) {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (existingUser) {
    throw new HttpError(409, "Email is already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash
      }
    });

    const workspace = await tx.workspace.create({
      data: {
        name: `${input.name}'s Workspace`,
        slug: workspaceSlugFromEmail(input.email),
        ownerId: createdUser.id
      }
    });

    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: createdUser.id,
        role: "owner",
        status: "active"
      }
    });

    return createdUser;
  });

  const session = await createSessionAndToken(user);

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    }
  };
}

export async function login(input: z.infer<typeof loginSchema>) {
  const user = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (!user) {
    throw new HttpError(401, "Invalid email or password");
  }

  const isValid = await bcrypt.compare(input.password, user.passwordHash);

  if (!isValid) {
    throw new HttpError(401, "Invalid email or password");
  }

  const session = await createSessionAndToken(user);

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      name: user.name
    }
  };
}

export async function logout(sessionId: string) {
  await prisma.userSession.updateMany({
    where: {
      id: sessionId,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });

  return { ok: true };
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        where: {
          status: "active"
        },
        include: {
          workspace: true
        }
      }
    }
  });

  if (!user) {
    throw new HttpError(404, "User not found");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    workspaces: user.memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      timezone: membership.workspace.timezone,
      plan: membership.workspace.plan,
      role: membership.role
    }))
  };
}
