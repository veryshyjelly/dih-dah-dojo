#!/data/data/com.termux/files/usr/bin/python3
"""Manage only Dojo's private runit service; never the shared Bifrost supervisor."""
import argparse
import os
import signal
from pathlib import Path
import subprocess
import time

PREFIX = Path('/data/data/com.termux/files/usr')
ROOT = Path.home() / 'cw-dojo'
SERVICE = ROOT / 'service'


def signal_node():
    """PRoot does not forward runit's TERM; signal only this service's Node child."""
    try:
        root_pid = int((SERVICE / 'supervise/pid').read_text().strip())
    except (OSError, ValueError):
        return 1
    processes = {}
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        try:
            status = dict(line.split(':', 1) for line in (path / 'status').read_text().splitlines() if ':' in line)
            processes[int(path.name)] = int(status['PPid'].strip())
        except (OSError, KeyError, ValueError):
            continue
    descendants = {root_pid}
    for _ in range(16):
        found = {pid for pid, parent in processes.items() if parent in descendants}
        if found.issubset(descendants):
            break
        descendants.update(found)
    delivered = False
    for pid in descendants - {root_pid}:
        try:
            command = (Path('/proc') / str(pid) / 'cmdline').read_bytes()
            if b'/dojo/releases/' in command and b'/server-dist/index.mjs' in command:
                os.kill(pid, signal.SIGTERM)
                delivered = True
        except (OSError, ProcessLookupError):
            continue
    return 0 if delivered else 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['start', 'stop', 'restart', 'status', 'run', 'signal'])
    args = parser.parse_args()
    if args.action == 'signal':
        raise SystemExit(signal_node())
    if args.action == 'run':
        release = (ROOT / 'current').resolve(strict=True)
        if release.parent != (ROOT / 'releases').resolve():
            raise SystemExit('Refusing a release outside Dojo releases')
        env = dict(os.environ, PATH=str(PREFIX / 'bin') + ':/system/bin')
        command = [str(PREFIX / 'bin/proot-distro'), 'login', '--bind', str(ROOT) + ':/dojo', 'bifrost-debian', '--', '/usr/bin/python3', '/dojo/launch-guest.py', release.name]
        os.execve(command[0], command, env)
    if args.action == 'start':
        status = subprocess.run([str(PREFIX / 'bin/sv'), 'status', str(SERVICE)], capture_output=True)
        if status.returncode != 0:
            log = open(ROOT / 'logs/supervisor.log', 'ab', buffering=0)
            subprocess.Popen([str(PREFIX / 'bin/runsv'), str(SERVICE)], stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
            for _ in range(30):
                if (SERVICE / 'supervise/ok').exists():
                    break
                time.sleep(.1)
        subprocess.run([str(PREFIX / 'bin/sv'), 'up', str(SERVICE)], check=True)
        print('Dojo supervision started')
    else:
        action = {'stop': 'down', 'restart': 'restart', 'status': 'status'}[args.action]
        raise SystemExit(subprocess.run([str(PREFIX / 'bin/sv'), '-w', '30', action, str(SERVICE)]).returncode)


if __name__ == '__main__':
    main()
