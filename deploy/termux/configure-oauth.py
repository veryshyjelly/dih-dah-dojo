#!/data/data/com.termux/files/usr/bin/python3
"""Owner-run secret entry. Values are hidden, stored privately, and never printed."""
from getpass import getpass
from pathlib import Path
import subprocess

root = Path.home() / 'cw-dojo'
path = root / 'private.env'
values = dict(line.split('=', 1) for line in path.read_text().splitlines() if line and not line.startswith('#'))
print('Public app: https://dojo.veryshyjelly.in')
for provider in ['GOOGLE', 'GITHUB']:
    print(provider + ' callback: https://dojoapi.veryshyjelly.in/api/auth/callback/' + provider.lower())
    client = input(provider + ' client ID (Enter keeps existing): ').strip()
    secret = getpass(provider + ' client secret (hidden; Enter keeps existing): ').strip()
    if client:
        values[provider + '_CLIENT_ID'] = client
    if secret:
        values[provider + '_CLIENT_SECRET'] = secret
    if '\n' in client or '\n' in secret:
        raise SystemExit('Credentials must be single-line values')
path.write_text('\n'.join(key + '=' + value for key, value in values.items()) + '\n')
path.chmod(0o600)
subprocess.run(['/data/data/com.termux/files/usr/bin/python3', str(root / 'manage.py'), 'restart'], check=True)
print('Private credentials updated. No values were printed.')
