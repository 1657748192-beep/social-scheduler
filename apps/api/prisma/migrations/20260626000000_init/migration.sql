CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'editor', 'viewer');
CREATE TYPE member_status AS ENUM ('active', 'invited', 'disabled');
CREATE TYPE platform AS ENUM ('x', 'instagram', 'facebook', 'tiktok');
CREATE TYPE social_account_status AS ENUM ('active', 'disconnected', 'token_expired');
CREATE TYPE post_status AS ENUM ('draft', 'in_review', 'approved', 'scheduled', 'archived');
CREATE TYPE publish_status AS ENUM ('draft', 'queued', 'publishing', 'published', 'failed', 'canceled');
CREATE TYPE schedule_status AS ENUM ('scheduled', 'locked', 'published', 'failed', 'canceled');
CREATE TYPE job_status AS ENUM ('waiting', 'active', 'succeeded', 'retrying', 'failed', 'dead');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  plan TEXT NOT NULL DEFAULT 'free',
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'owner',
  status member_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform platform NOT NULL,
  provider_account_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  account_type TEXT,
  status social_account_status NOT NULL DEFAULT 'active',
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, platform, provider_account_id)
);

CREATE TABLE media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  file_url TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_sec INTEGER,
  status TEXT NOT NULL DEFAULT 'ready',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  title TEXT,
  base_text TEXT NOT NULL,
  workflow_status post_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE post_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  social_account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform platform NOT NULL,
  text TEXT NOT NULL,
  link_url TEXT,
  platform_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  publish_status publish_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE post_variant_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_variant_id UUID NOT NULL REFERENCES post_variants(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_variant_id UUID NOT NULL REFERENCES post_variants(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status schedule_status NOT NULL DEFAULT 'scheduled',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE publish_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  post_variant_id UUID NOT NULL REFERENCES post_variants(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status job_status NOT NULL DEFAULT 'waiting',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  idempotency_key TEXT NOT NULL UNIQUE,
  locked_at TIMESTAMPTZ,
  provider_post_id TEXT,
  provider_permalink TEXT,
  last_error TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  ip TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX posts_workspace_status_created_idx ON posts(workspace_id, workflow_status, created_at);
CREATE INDEX schedules_workspace_time_status_idx ON schedules(workspace_id, scheduled_at, status);
CREATE INDEX publish_jobs_workspace_status_created_idx ON publish_jobs(workspace_id, status, created_at);
