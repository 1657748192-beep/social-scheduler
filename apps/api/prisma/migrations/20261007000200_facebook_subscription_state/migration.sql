CREATE TABLE "facebook_page_subscription_states" (
  "pageId" TEXT NOT NULL, "ownedFields" TEXT[] NOT NULL,
  "pendingRelease" BOOLEAN NOT NULL DEFAULT false, "releaseTokenEncrypted" TEXT,
  "releaseExpiresAt" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "facebook_page_subscription_states_pkey" PRIMARY KEY ("pageId")
);
