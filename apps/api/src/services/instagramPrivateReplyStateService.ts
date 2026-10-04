import { prisma } from "../prisma";

type ClaimInput = {
  socialAccountId: string;
  mediaId: string;
  commentId: string;
};

type AttemptStatus = "sent" | "failed";

type FinishInput = ClaimInput & {
  status: AttemptStatus;
  providerMessageId?: string;
};

export type PrivateReplyAttemptStore = {
  create(data: ClaimInput): Promise<unknown>;
  updatePending(
    where: Pick<ClaimInput, "socialAccountId" | "commentId">,
    update: { status: AttemptStatus; providerMessageId: string | null }
  ): Promise<number>;
};

const prismaStore: PrivateReplyAttemptStore = {
  create(data) {
    return prisma.instagramPrivateReplyAttempt.create({ data });
  },
  async updatePending(where, update) {
    const result = await prisma.instagramPrivateReplyAttempt.updateMany({
      where: { ...where, status: "pending" },
      data: update
    });
    return result.count;
  }
};

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function claimInstagramPrivateReplyAttempt(
  store: PrivateReplyAttemptStore,
  input: ClaimInput
): Promise<{ claimed: true } | { claimed: false; reason: "already_attempted" }> {
  try {
    await store.create(input);
    return { claimed: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { claimed: false, reason: "already_attempted" };
    }
    throw error;
  }
}

export async function finishInstagramPrivateReplyAttempt(
  store: PrivateReplyAttemptStore,
  input: FinishInput
): Promise<boolean> {
  const { socialAccountId, commentId, status, providerMessageId } = input;
  return (await store.updatePending(
    { socialAccountId, commentId },
    { status, providerMessageId: providerMessageId ?? null }
  )) === 1;
}

export const instagramPrivateReplyAttemptStore = prismaStore;
