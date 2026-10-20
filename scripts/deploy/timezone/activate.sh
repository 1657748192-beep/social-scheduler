#!/usr/bin/env bash
source "$(dirname "$0")/common.sh"
[[ $(<"$release/prepared") = ready ]]
assert_infrastructure
python3 "$release/context/scripts/deploy/timezone/check_image_capacity.py" "$release" "$target"
publishing_snapshot > "$release/publishing-before.json"
rollback(){
 trap - ERR
 dc -f "$release/rollback.yml" up -d --no-deps --no-build api web > "$release/rollback.log" 2>&1
 assert_infrastructure
 printf 'API_WEB_ROLLED_BACK_NO_DATABASE_RESTORE_NO_WORKER_RESTART\n' >&2
 exit 1
}
trap rollback ERR
dc -f "$release/images.yml" up -d --no-deps --no-build api web > "$release/activate.log" 2>&1
bash "$release/context/scripts/deploy/timezone/verify.sh"
trap - ERR
printf 'API_WEB_DEPLOYED_WORKER_CREDENTIALS_SCHEDULES_UNCHANGED\n'
