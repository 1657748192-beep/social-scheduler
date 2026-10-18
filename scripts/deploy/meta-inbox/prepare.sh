#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
[[ -z $(git status --porcelain --untracked-files=no) ]]
[[ ! -e "$release/build-started" ]]
schema_preconditions
available_kb=$(df -Pk "$repo" | awk 'NR==2 {print $4}')
[[ $available_kb =~ ^[0-9]+$ && $available_kb -ge 4194304 ]]
mkdir -p "$release/context" "$release/rescue-context"
printf '%s\n' "$target" > "$release/target"
printf 'started\n' > "$release/build-started"
sha256sum .env .env.sandbox.local > "$release/env-before.sha256"
protected_containers > "$release/containers-before"
publishing_snapshot > "$release/publishing-before.json"
docker inspect --format '{{.Image}}' "$(dc ps -q api)" > "$release/prior-api"
docker inspect --format '{{.Image}}' "$(dc ps -q web)" > "$release/prior-web"
docker image tag "$(<"$release/prior-api")" "social-meta-prior-api:$target"
docker image tag "$(<"$release/prior-web")" "social-meta-prior-web:$target"
# Archive only reviewed commits. Never reset/check out the production working tree.
git archive "$target" | tar -xf - -C "$release/context"
git archive "$rescue" | tar -xf - -C "$release/rescue-context"
[[ -f "$release/context/apps/api/Dockerfile" && -f "$release/context/apps/web/Dockerfile" && -f "$release/rescue-context/apps/api/Dockerfile" ]]
docker build --label "org.opencontainers.image.revision=$target" -t "social-meta-api:$target" -f "$release/context/apps/api/Dockerfile" "$release/context"
docker build --label "org.opencontainers.image.revision=$target" --build-arg "NEXT_PUBLIC_API_URL=$public_origin/api/v1" -t "social-meta-web:$target" -f "$release/context/apps/web/Dockerfile" "$release/context"
# Legacy APIs have Instagram-blind expiry. Never use that old API against new data.
docker build --label "org.opencontainers.image.revision=$rescue" -t "social-meta-api:$rescue" -f "$release/rescue-context/apps/api/Dockerfile" "$release/rescue-context"
printf '%s\n' "social-meta-api:$rescue" > "$release/rollback-api"
printf '%s\n' "social-meta-prior-web:$target" > "$release/rollback-web"
printf 'services:\n  api:\n    image: social-meta-api:%s\n  web:\n    image: social-meta-web:%s\n' "$target" "$target" > "$release/images.yml"
assert_protected
# Apply additive migrations before replacing the healthy API. On failure the
# existing API and Worker continue running; never reverse/resolve migrations here.
api_container=$(dc ps -q api)
docker cp "$release/context/apps/api/prisma" "$api_container:/tmp/meta-inbox-$target"
docker exec "$api_container" /app/node_modules/.bin/prisma migrate deploy --schema "/tmp/meta-inbox-$target/schema.prisma"
assert_protected
printf 'ready\n' > "$release/prepared"
printf 'ONLY_API_WEB_IMAGES_PREPARED\n'
