import type { ReceivedEvent } from "./instagramReceptionStore";

type Account = { id: string; providerAccountId: string; status: string; scopes: string[] };
export function createInstagramReceptionService(input: {
  findAccounts(providerId: string): Promise<Account[]>;
  store: { recordComment(id: string, event: ReceivedEvent): Promise<void>; recordMessage(id: string, event: ReceivedEvent): Promise<void> };
}) {
  return {
    async receive(event: ReceivedEvent) {
      if ([event.accountId, event.eventId, event.senderId, event.recipientId, event.mediaId].some(id => id && id.length > 256)) return;
      if (event.field === "messages" && event.senderId !== event.accountId && event.recipientId !== event.accountId) return;
      const accounts = await input.findAccounts(event.accountId);
      for (const account of accounts) {
        if (account.status !== "active" || account.providerAccountId !== event.accountId) continue;
        const scope = event.field === "messages" ? "instagram_business_manage_messages" : "instagram_business_manage_comments";
        if (!account.scopes.includes(scope)) continue;
        if (event.field === "messages") await input.store.recordMessage(account.id, event);
        else await input.store.recordComment(account.id, event);
      }
    }
  };
}
