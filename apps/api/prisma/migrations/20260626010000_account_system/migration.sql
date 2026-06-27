CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role workspace_role NOT NULL DEFAULT 'viewer',
  token_hash TEXT NOT NULL UNIQUE,
  status invitation_status NOT NULL DEFAULT 'pending',
  invited_by_id UUID NOT NULL REFERENCES users(id),
  accepted_by_id UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_sessions_user_revoked_expires_idx ON user_sessions(user_id, revoked_at, expires_at);
CREATE INDEX workspace_invitations_workspace_status_created_idx ON workspace_invitations(workspace_id, status, created_at);
CREATE INDEX workspace_invitations_email_status_idx ON workspace_invitations(email, status);
