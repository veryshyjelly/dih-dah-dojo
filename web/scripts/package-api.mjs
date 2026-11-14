import { mkdir, cp, copyFile, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = new URL('../../.local/api-release/', import.meta.url);
await mkdir(root, { recursive: true });
await cp('server-dist', new URL('server-dist', root), { recursive: true });
await cp('../deploy/termux', new URL('deploy', root), { recursive: true });
for (const file of ['package.json', 'package-lock.json']) await copyFile(file, new URL(file, root));
const packed = execFileSync(
  'npm',
  [
    'pack',
    'npm@11.20.0',
    '--pack-destination',
    new URL('../../.local/', import.meta.url).pathname,
    '--silent',
  ],
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .at(-1);
await copyFile(new URL('../../.local/' + packed, import.meta.url), new URL('npm.tgz', root));
const archive = new URL('../../.local/dojo-api.tar.gz', import.meta.url).pathname;
execFileSync('tar', ['-czf', archive, '-C', root.pathname, '.'], {
  env: { ...process.env, COPYFILE_DISABLE: '1' },
});
const digest = createHash('sha256')
  .update(await readFile(archive))
  .digest('hex');
await writeFile(archive + '.sha256', digest + '\n');
console.log(archive + '\nsha256=' + digest);
