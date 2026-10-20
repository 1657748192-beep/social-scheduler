"""Generate narrow read-only mounts; never change Redis, its limits or its config."""
import json
import os
import pathlib
import re
import subprocess
import sys

TARGET = '/run/social-scheduler/timezone-capacity'


def build_probe(cgroup_path, cgroup_root, host_meminfo, run_id, binding_path):
    relative = pathlib.PurePosixPath(cgroup_path)
    if not relative.is_absolute() or '..' in relative.parts or '\\' in cgroup_path:
        raise ValueError('Invalid cgroup path')
    if not re.fullmatch('[a-f0-9]{40}', run_id):
        raise ValueError('Invalid Redis run identity')
    root = pathlib.Path(cgroup_root).resolve(strict=True)
    leaf = root.joinpath(*relative.parts[1:]).resolve(strict=True)
    if leaf == root or root not in leaf.parents:
        raise ValueError('Redis cgroup must be beneath the verified root')
    host = pathlib.Path(host_meminfo).resolve(strict=True)
    if not host.is_file():
        raise ValueError('Host memory metrics unavailable')
    mounts = []

    def mount(source, target):
        mounts.append({'type': 'bind', 'source': str(source), 'target': TARGET + '/' + target,
                       'read_only': True, 'bind': {'create_host_path': False}})

    mount(pathlib.Path(binding_path).absolute(), 'binding.json')
    mount(host, 'meminfo')
    level = leaf
    count = 0
    # Check the leaf and every parent. Only the cgroup2 root may omit memory.max.
    while True:
        limit = level / 'memory.max'
        current = level / 'memory.current'
        if level == root and not limit.exists():
            break
        if count >= 16 or not limit.is_file() or not current.is_file():
            raise ValueError('Incomplete Redis cgroup ancestry')
        for metric in [limit, current]:
            resolved = metric.resolve(strict=True)
            if root not in resolved.parents:
                raise ValueError('Memory metric escaped cgroup root')
        if not re.fullmatch(r'(max|\d+)\s*', limit.read_text()) or not re.fullmatch(r'\d+\s*', current.read_text()):
            raise ValueError('Malformed Redis cgroup metrics')
        mount(limit, f'level-{count}/memory.max')
        mount(current, f'level-{count}/memory.current')
        count += 1
        if level == root:
            break
        level = level.parent
    return {'manifest': {'schemaVersion': 1, 'redisRunId': run_id, 'levels': count}, 'mounts': mounts}


def main(binding_path):
    def command(*args):
        return subprocess.check_output(args, text=True, timeout=10).strip()

    def identity():
        ident = command('docker', 'inspect', '--format', '{{.Id}}|{{.State.Pid}}', 'social_scheduler_redis')
        cid, pid = ident.split('|')
        if not re.fullmatch('[a-f0-9]{64}', cid) or not pid.isdigit() or int(pid) < 2:
            raise ValueError('Redis container is not running')
        membership = pathlib.Path('/proc', pid, 'cgroup').read_text().strip()
        if not membership.startswith('0::/') or '\n' in membership:
            raise ValueError('Only verified cgroup v2 is supported')
        server = command('docker', 'exec', cid, 'redis-cli', '--raw', 'INFO', 'server')
        run_id = re.findall(r'^run_id:([a-f0-9]{40})\r?$', server, re.M)
        if len(run_id) != 1:
            raise ValueError('Redis identity unavailable')
        return cid, membership[3:], run_id[0]

    if command('stat', '-fc', '%T', '/sys/fs/cgroup') != 'cgroup2fs':
        raise ValueError('Host cgroup filesystem not verified')
    before = identity()
    result = build_probe(before[1], '/sys/fs/cgroup', '/proc/meminfo', before[2], binding_path)
    if identity() != before:
        raise ValueError('Redis changed during probe preparation')
    # Deployment-owned, not web-controlled. No secret or credential is stored here.
    with open(binding_path, 'x', encoding='utf-8') as stream:
        os.chmod(binding_path, 0o600)
        json.dump(result['manifest'], stream)
    print(json.dumps(result))


if __name__ == '__main__':
    main(sys.argv[1])
