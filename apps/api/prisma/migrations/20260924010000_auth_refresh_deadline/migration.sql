ALTER TABLE oauth_credentials ADD COLUMN refresh_token_expires_at TIMESTAMP(3);

UPDATE oauth_credentials AS oc
SET expires_at = NULL
FROM social_accounts AS sa
WHERE oc.social_account_id = sa.id
  AND sa.platform = 'facebook'
  AND sa.account_type = 'page';
