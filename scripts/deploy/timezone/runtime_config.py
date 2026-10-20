"""Preserve exact running environments and mounts; never print their contents."""
import json
import pathlib
import sys


def main(release, target, verify=False):
    root = pathlib.Path(release)
    old = {s: json.loads((root / (s + '-before.private.json')).read_text())[0] for s in ['api', 'web']}
    environments = {s: dict(v.split('=', 1) for v in old[s]['Config']['Env']) for s in old}
    if verify:
        rendered = json.loads((root / 'rendered.private.json').read_text())
        for service in old:
            # `compose config` escapes dollars again for round-trip output.
            # Actual container environments are independently compared after up.
            expected = {k: v.replace('$', '$$') for k, v in environments[service].items()}
            if rendered['services'][service]['environment'] != expected:
                raise ValueError('Runtime environment would change')
        if rendered['services']['api']['command'] != ['node', 'dist/server.js']:
            raise ValueError('Migrations must never run during activation')
        if any(not m.get('read_only') for m in rendered['services']['api']['volumes'] if m['target'].startswith('/run/social-scheduler/timezone-capacity/')):
            raise ValueError('Writable capacity probe forbidden')
        return
    volumes = {}

    def mounts(service):
        result = []
        for m in old[service]['Mounts']:
            if m['Type'] == 'volume':
                source = m['Name']
                volumes[source] = {'external': True, 'name': source}
            elif m['Type'] == 'bind':
                source = m['Source']
            else:
                raise ValueError('Unexpected existing runtime mount')
            record = {'type': m['Type'], 'source': source, 'target': m['Destination'], 'read_only': not m['RW']}
            if m['Type'] == 'bind':
                record['bind'] = {'create_host_path': False}
            result.append(record)
        return result

    prior_mounts = {s: mounts(s) for s in old}
    probe = json.loads((root / 'probe.json').read_text())['mounts']
    for rollback in [False, True]:
        # Compose 5 supports !override. Do not merge old defaults into a captured
        # environment: a new default could otherwise change credentials/flags.
        lines = ['services:']
        for service in old:
            image = ('social-timezone-prior-' if rollback else 'social-timezone-') + service + ':' + target
            service_mounts = prior_mounts[service] + (probe if service == 'api' and not rollback else [])
            command = ['node', 'dist/server.js'] if service == 'api' else old[service]['Config']['Cmd']
            lines += ['  ' + service + ':', '    image: ' + image,
                      '    environment: !override ' + json.dumps({k: v.replace('$', '$$') for k, v in environments[service].items()}),
                      '    volumes: !override ' + json.dumps(service_mounts),
                      '    command: !override ' + json.dumps(command)]
        lines += ['volumes: ' + json.dumps(volumes)]
        path = root / ('rollback.yml' if rollback else 'images.yml')
        path.write_text('\n'.join(lines) + '\n')
        path.chmod(0o600)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], '--verify-rendered' in sys.argv[3:])
