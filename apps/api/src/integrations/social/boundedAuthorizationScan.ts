export async function nextAuthorizationScanBatch(input: {
  readCursor: () => Promise<string | null>;
  writeCursor: (cursor: string | null) => Promise<void>;
  select: (afterId: string | null, limit: number) => Promise<string[]>;
  limit?: number;
}) {
  const limit = input.limit ?? 100;
  const cursor = await input.readCursor();
  let ids = await input.select(cursor, limit);
  if (!ids.length && cursor) ids = await input.select(null, limit);
  await input.writeCursor(ids.at(-1) ?? null);
  return ids;
}
