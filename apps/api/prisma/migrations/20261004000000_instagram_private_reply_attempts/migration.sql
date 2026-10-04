CREATE TYPE instagram_private_reply_status AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE instagram_private_reply_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id UUID NOT NULL,
  media_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  status instagram_private_reply_status NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT instagram_private_reply_attempts_social_account_id_fkey
    FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX instagram_private_reply_attempts_social_account_id_comment_id_key
  ON instagram_private_reply_attempts(social_account_id, comment_id);

CREATE INDEX instagram_private_reply_attempts_social_account_id_media_id_created_at_idx
  ON instagram_private_reply_attempts(social_account_id, media_id, created_at);
