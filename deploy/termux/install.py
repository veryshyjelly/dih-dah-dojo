#!/data/data/com.termux/files/usr/bin/python3
"""Install a checksummed API release without changing shared runtimes/services."""
import argparse
import hashlib
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tarfile
import time
import urllib.request

PREFIX = Path('/data/data/com.termux/files/usr')
ROOT = Path.home() / 'cw-dojo'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=Path)
    parser.add_argument('sha256')
    args = parser.parse_args()
    digest = hashlib.sha256(args.archive.read_bytes()).hexdigest()
    if digest != args.sha256:
        raise SystemExit('Release checksum does not match')
    release_id = digest[:16]
    release = ROOT / 'releases' / release_id
    for directory in [ROOT, ROOT / 'releases', ROOT / 'data', ROOT / 'backups', ROOT / 'logs', ROOT / 'service/log', ROOT / 'service/control', ROOT / 'logs/api']:
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    release.mkdir(exist_ok=True)
    with tarfile.open(args.archive) as archive:
        for member in archive.getmembers():
            if member.issym() or member.islnk() or not (release / member.name).resolve().is_relative_to(release.resolve()):
                raise SystemExit('Unsafe release archive member')
        archive.extractall(release, filter='data')
    private = ROOT / 'private.env'
    if not private.exists():
        private.write_text('APP_ORIGIN=https://dojo.veryshyjelly.in\nAPI_ORIGIN=https://dojoapi.veryshyjelly.in\nDB_PATH=/dojo/data/dojo.sqlite\nBACKUP_PATH=/dojo/backups\nPORT=8787\nAUTH_SECRET=' + secrets.token_urlsafe(48) + '\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nGITHUB_CLIENT_ID=\nGITHUB_CLIENT_SECRET=\n')
        private.chmod(0o600)
    npm_root = ROOT / 'tooling/npm'
    npm_root.mkdir(parents=True, exist_ok=True)
    if not (npm_root / 'package/bin/npm-cli.js').exists():
        with tarfile.open(release / 'npm.tgz') as npm:
            npm.extractall(npm_root, filter='data')
    env = dict(os.environ, PATH=str(PREFIX / 'bin') + ':/system/bin')
    base = [str(PREFIX / 'bin/proot-distro'), 'login', '--bind', str(ROOT) + ':/dojo', 'bifrost-debian', '--', '/usr/bin/env', 'PATH=/opt/bifrost-candidate/bin:/usr/bin:/bin', 'HOME=/dojo', 'NPM_CONFIG_CACHE=/dojo/npm-cache', '/opt/bifrost-candidate/bin/node', '/dojo/tooling/npm/package/bin/npm-cli.js', '--prefix', '/dojo/releases/' + release_id]
    subprocess.run(base + ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], env=env, check=True)
    subprocess.run(base + ['rebuild', 'better-sqlite3'], env=env, check=True)
    for name in ['manage.py', 'launch-guest.py', 'configure-oauth.py']:
        shutil.copyfile(release / 'deploy' / name, ROOT / name)
        (ROOT / name).chmod(0o700)
    run = '#!' + str(PREFIX / 'bin/sh') + '\nexec 2>&1\nexec ' + str(PREFIX / 'bin/python3') + ' ' + str(ROOT / 'manage.py') + ' run\n'
    (ROOT / 'service/run').write_text(run)
    (ROOT / 'service/run').chmod(0o700)
    (ROOT / 'service/control/t').write_text('#!' + str(PREFIX / 'bin/sh') + '\nexec ' + str(PREFIX / 'bin/python3') + ' ' + str(ROOT / 'manage.py') + ' signal\n')
    (ROOT / 'service/control/t').chmod(0o700)
    (ROOT / 'service/log/run').write_text('#!' + str(PREFIX / 'bin/sh') + '\nexec ' + str(PREFIX / 'bin/svlogd') + ' -tt ' + str(ROOT / 'logs/api') + '\n')
    (ROOT / 'service/log/run').chmod(0o700)
    (ROOT / 'logs/api/config').write_text('s1048576\nn7\n')
    previous = (ROOT / 'current').resolve() if (ROOT / 'current').exists() else None
    temporary = ROOT / 'current.next'
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(release)
    os.replace(temporary, ROOT / 'current')
    boot = Path.home() / '.termux/boot/30-cw-dojo'
    boot.parent.mkdir(parents=True, exist_ok=True)
    boot.write_text('#!' + str(PREFIX / 'bin/sh') + '\n' + str(PREFIX / 'bin/termux-wake-lock') + '\nexec ' + str(PREFIX / 'bin/python3') + ' ' + str(ROOT / 'manage.py') + ' start\n')
    boot.chmod(0o700)
    subprocess.run([str(PREFIX / 'bin/python3'), str(ROOT / 'manage.py'), 'start'], check=True)
    if previous is not None:
        subprocess.run([str(PREFIX / 'bin/python3'), str(ROOT / 'manage.py'), 'restart'], check=True)
    for _ in range(60):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8787/health', timeout=2) as response:
                if response.status == 200:
                    print('Dojo API healthy; release ' + release_id)
                    return
        except Exception:
            time.sleep(1)
    if previous is not None:
        temporary.symlink_to(previous)
        os.replace(temporary, ROOT / 'current')
        subprocess.run([str(PREFIX / 'bin/python3'), str(ROOT / 'manage.py'), 'restart'], check=True)
    raise SystemExit('Dojo did not become healthy. Previous releases and all data remain intact.')


if __name__ == '__main__':
    main()
