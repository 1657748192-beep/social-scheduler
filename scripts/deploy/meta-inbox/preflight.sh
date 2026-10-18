#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
# Read-only: no release files, builds, subscriptions or service changes.
git status --short --untracked-files=no
sha256sum .env .env.sandbox.local
protected_containers
publishing_snapshot
schema_preconditions
df -Pk "$repo"
curl -fsS --max-time 10 "$public_origin/api/v1/health"
printf '\nSCOPED_PREFLIGHT_COMPLETE\n'
