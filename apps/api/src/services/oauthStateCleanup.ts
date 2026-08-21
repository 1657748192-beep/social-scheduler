type OAuthStateStore = {
  deleteMany(args: { where: { id: string } }): Promise<{ count: number }>;
};

export async function removeOAuthStateIfPresent(store: OAuthStateStore, stateId: string) {
  const result = await store.deleteMany({ where: { id: stateId } });
  return result.count > 0;
}
