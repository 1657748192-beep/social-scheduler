import { config } from "../config";
import { prisma } from "../prisma";
import { migrateLegacyLocalMediaToCos } from "../services/mediaStorageService";

async function main() {
  const limitValue = Number(process.env.MEDIA_MIGRATION_BATCH_SIZE ?? 100);
  const limit = Number.isSafeInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 1000) : 100;

  if (config.MEDIA_STORAGE !== "cos") {
    throw new Error("MEDIA_STORAGE must be set to cos before local media can be migrated.");
  }

  const result = await migrateLegacyLocalMediaToCos(limit);
  console.log(`Local media migration: migrated ${result.migrated}/${result.scanned}, failed ${result.failed}`);
}

main()
  .catch((error) => {
    console.error("Local media migration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
