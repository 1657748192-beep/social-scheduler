import { UnrecoverableError } from "bullmq";

export class PublishOutcomeUnknownError extends UnrecoverableError {
  constructor(provider: string) {
    super(`${provider} may have accepted this post, but confirmation was not received. Check the provider before reposting.`);
    this.name = "PublishOutcomeUnknownError";
  }
}

export async function persistConfirmedPublishResult<T>(persist: () => Promise<T>, provider: string): Promise<T> {
  try {
    return await persist();
  } catch {
    throw new PublishOutcomeUnknownError(provider);
  }
}

export function hasRemainingPublishAttempts(error: Error, attemptsMade: number, maxAttempts: number) {
  return !(error instanceof UnrecoverableError) && attemptsMade < maxAttempts;
}
