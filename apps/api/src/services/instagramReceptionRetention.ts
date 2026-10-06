export function receptionRetentionCutoff(days = 90, now = new Date()) {
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error("Invalid Instagram reception retention");
  return new Date(now.getTime() - days * 86400000);
}

export async function runReceptionCleanup(store: { cleanup(before: Date, batchSize: number): Promise<{ comments: number; messages: number }> }, days = 90, now = new Date()) {
  const before = receptionRetentionCutoff(days, now);
  let comments = 0, messages = 0;
  for (let batch = 0; batch < 10; batch++) {
    const result = await store.cleanup(before, 500);
    comments += result.comments; messages += result.messages;
    if (result.comments < 500 && result.messages < 500) break;
  }
  return { comments, messages };
}
