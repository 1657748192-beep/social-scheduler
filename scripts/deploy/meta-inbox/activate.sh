#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
[[ $(<"$release/target") = "$target" && $(<"$release/prepared") = ready ]]
[[ $(<"$release/rollback-api") = "social-meta-api:$rescue" ]]
assert_protected
rollback() {
 trap - ERR
 printf 'services:\n  api:\n    image: %s\n  web:\n    image: %s\n' "$(<"$release/rollback-api")" "$(<"$release/rollback-web")" > "$release/rollback.yml"
 dc -f "$release/rollback.yml" up -d --no-deps --no-build api web
 # No database restore, migration reversal, env edits or Worker restart.
 printf 'API_WEB_RESCUE_ACTIVATED_VERIFY_HEALTH\n' >&2
 exit 1
}
trap rollback ERR
dc -f "$release/images.yml" up -d --no-deps --no-build api web
bash "$(dirname "$0")/verify.sh"
trap - ERR
printf 'API_WEB_ACTIVATED_WORKER_UNCHANGED\n'
