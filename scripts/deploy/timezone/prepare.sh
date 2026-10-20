#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
[[ ! -e "$release" ]]
[[ $(git rev-parse "$target^{commit}") = "$target" ]]
[[ $(df -Pk /opt/social-scheduler | awk 'NR==2{print $4}') -ge 8388608 ]]
[[ $(awk '/^MemAvailable:/{print $2}' /proc/meminfo) -ge 1048576 ]]
sudo -n install -d -o ubuntu -g ubuntu -m 0700 "$release"
sha256sum .env .env.sandbox.local > "$release/env-before.sha256"
protected_containers > "$release/containers-before"
for service in api web; do
 cid=$(dc ps -q "$service")
 docker inspect "$cid" > "$release/$service-before.private.json"
 docker inspect --format '{{.Image}}' "$cid" > "$release/prior-$service"
 docker image tag "$(<"$release/prior-$service")" "social-timezone-prior-$service:$target"
done
prior_api=$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(dc ps -q api)")
expected_api=${TIMEZONE_EXPECTED_API:?Exact previous API revision required}
expected_web=${TIMEZONE_EXPECTED_WEB:?Exact previous web revision required}
[[ $expected_api =~ ^[a-f0-9]{40}$ && $expected_web =~ ^[a-f0-9]{40}$ ]]
[[ $prior_api = "$expected_api" ]]
[[ $(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(dc ps -q web)") = "$expected_web" ]]
git diff --quiet "$prior_api" "$target" -- apps/api/prisma
mkdir -m 0700 "$release/context"
git archive "$target" | tar -xf - -C "$release/context"
python3 "$release/context/scripts/deploy/timezone/prepare_probe.py" "$release/probe-binding.json" > "$release/probe.json"
python3 "$release/context/scripts/deploy/timezone/runtime_config.py" "$release" "$target"
dc -f "$release/images.yml" config --format json > "$release/rendered.private.json"
python3 "$release/context/scripts/deploy/timezone/runtime_config.py" "$release" "$target" --verify-rendered
docker build --label "org.opencontainers.image.revision=$target" -t "social-timezone-api:$target" -f "$release/context/apps/api/Dockerfile" "$release/context" > "$release/api-build.log" 2>&1
[[ $(df -Pk /opt/social-scheduler | awk 'NR==2{print $4}') -ge 3145728 ]]
docker build --label "org.opencontainers.image.revision=$target" --build-arg NEXT_PUBLIC_API_URL=https://app.bufferhelp.com/api/v1 -t "social-timezone-web:$target" -f "$release/context/apps/web/Dockerfile" "$release/context" > "$release/web-build.log" 2>&1
[[ $(df -Pk /opt/social-scheduler | awk 'NR==2{print $4}') -ge 2097152 ]]
python3 "$release/context/scripts/deploy/timezone/check_image_capacity.py" "$release" "$target"
assert_infrastructure
printf 'ready\n' > "$release/prepared"
printf 'API_WEB_IMAGES_READY_NO_RUNNING_SERVICES_CHANGED\n'
