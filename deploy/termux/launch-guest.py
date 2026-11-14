#!/usr/bin/python3
"""Load secrets inside the guest and exec Node, keeping them out of argv/logs."""
import os
from pathlib import Path
import sys

root = Path('/dojo')
release = root / 'releases' / sys.argv[1]
if release.resolve().parent != (root / 'releases').resolve():
    raise SystemExit('Invalid release')
env = {'PATH': '/opt/bifrost-candidate/bin:/usr/bin:/bin', 'HOME': '/dojo', 'LANG': 'C.UTF-8', 'NODE_ENV': 'production'}
for line in (root / 'private.env').read_text().splitlines():
    if line and not line.startswith('#'):
        key, value = line.split('=', 1)
        if not key.replace('_', '').isalnum() or not key.isupper():
            raise SystemExit('Invalid private environment key')
        env[key] = value
os.chdir(release)
node = '/opt/bifrost-candidate/bin/node'
os.execve(node, [node, '--max-old-space-size=192', str(release / 'server-dist/index.mjs')], env)
