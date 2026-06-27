CREATE TABLE oauth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id UUID NOT NULL UNIQUE REFERENCES social_accounts(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform platform NOT NULL,
  state TEXT NOT NULL UNIQUE,
  code_verifier TEXT,
  redirect_uri TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX oauth_states_workspace_platform_created_idx ON oauth_states(workspace_id, platform, created_at);
CREATE INDEX oauth_states_expires_idx ON oauth_states(expires_at);
