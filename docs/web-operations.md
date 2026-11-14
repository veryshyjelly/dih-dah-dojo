# Web operations

The frontend at `dojo.veryshyjelly.in` is a Cloudflare static-assets deployment.
The API at `dojoapi.veryshyjelly.in` is HTTP loopback port 8787 on the Termux phone,
reached through the existing remotely managed `ssh-termux` tunnel. Its added CNAME
and route preserve the existing SSH hostname. Credentials remain on the phone.

## Isolation

Dojo lives under `~/cw-dojo`: `releases/`, atomic `current` symlink, `data/`,
`backups/`, `logs/`, private npm tooling, and `private.env`. It uses the existing
read-only Node 22.23.4 binary in the `bifrost-debian` PRoot guest. No shared package,
container, application, boot hook, or tunnel token is replaced. Dependencies are
installed privately for Debian ARM64; native SQLite is built on the phone.

A private runit service supervises Dojo and rotates its logs (seven 1 MiB files).
PRoot does not forward runit's TERM to Node, so `service/control/t` invokes the
manager's scoped signal handler. It locates only Node processes below Dojo's own
supervised PRoot PID with a Dojo release entrypoint, then requests graceful shutdown.
It does not use broad `pkill`, shared service commands, or signal unrelated processes.

```sh
python ~/cw-dojo/manage.py status
python ~/cw-dojo/manage.py restart
python ~/cw-dojo/manage.py stop
python ~/cw-dojo/manage.py start
```

`~/.termux/boot/30-cw-dojo` acquires a wake lock and starts this service. Android still
requires an unlock after reboot; battery restrictions and device/network outages
can affect availability. An actual phone reboot was not performed during deployment.

## Releases and rollback

From `web/`, build WASM and both application bundles, then run:

```sh
node scripts/package-api.mjs
```

Upload `.local/dojo-api.tar.gz` and `deploy/termux/install.py` to the phone. Run
`python ~/dojo-install.py ~/dojo-api-release.tar.gz <sha256 from package output>`.
The installer verifies the archive hash and paths, installs into a separate release,
preserves private data/credentials, switches `current` atomically, restarts Dojo,
and checks health. On an update health failure it restores the prior symlink.
Keep prior releases available for rollback. A first-install failure has no prior
release to restore; data and logs are retained for diagnosis.

Health: `http://127.0.0.1:8787/health` on the phone. The public health endpoint exposes
only readiness and provider flags. Protected profile/history requests require a
session; mutations require the exact frontend Origin. Rate/body/queue limits are
bounded. The account service intentionally listens only on loopback.

## Backups and restoration

SQLite uses WAL, foreign keys and FULL synchronization. On startup and hourly, the
service creates that UTC date's consistent SQLite backup if absent, retaining the
latest 14 daily files. Backups contain account credentials/tokens and personal
history: keep them private and maintain a separate owner-controlled off-device
backup schedule. Deployment verifies an off-device copy; it does not install an
ongoing off-device scheduler.

To restore, stop Dojo, preserve the current database and WAL/SHM as one private
recovery set, copy a chosen consistent backup to `data/dojo.sqlite`, remove only
stale WAL/SHM belonging to the replaced database after preserving them, and start
Dojo. Verify `PRAGMA integrity_check` on a copy before replacement. Reconcile any
pending browser uploads after restoring; an acknowledged reset generation prevents
older uploads from recreating deleted progress.

Reset/account deletion remove live data. Previously exported or retained daily
backups remain until their retention expires or the owner removes them. Binary
account exports use `CWDOJOW1`, SHA-256, and typed length-prefixed Postcard frames;
they are separate from native redb exports. No import is offered in this release.
