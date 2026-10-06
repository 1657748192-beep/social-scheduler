import { prisma } from "../prisma";
import { config } from "../config";
import { createInstagramReceptionStore } from "./instagramReceptionStore";
import { createInstagramReceptionService } from "./instagramReceptionService";

export const instagramReceptionStore = createInstagramReceptionStore(prisma, config.INSTAGRAM_RECEPTION_RETENTION_DAYS);
export const instagramReceptionService = createInstagramReceptionService({
  store: instagramReceptionStore,
  findAccounts: async providerAccountId => (await prisma.socialAccount.findMany({
    where: { platform: "instagram", providerAccountId, status: "active" },
    select: { id: true, providerAccountId: true, status: true, credential: { select: { scopes: true } } }
  })).map(account => ({ ...account, scopes: account.credential?.scopes ?? [] }))
});
