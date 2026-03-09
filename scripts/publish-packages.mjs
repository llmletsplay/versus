import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { getWorkspacePackages, orderWorkspacePackages, run } from './package-workspace.mjs';

const root = process.cwd();
const npmCacheDir = join(root, '.npm-cache');
await mkdir(npmCacheDir, { recursive: true });

const rawArgs = process.argv.slice(2);
const dryRun = rawArgs.includes('--dry-run');
const publishArgs = rawArgs.filter((arg) => arg !== '--dry-run');
const manifests = await getWorkspacePackages(root);
const orderedPackages = orderWorkspacePackages(manifests);

for (const { cwd, manifest } of orderedPackages) {
  console.log(`\n==> ${dryRun ? 'Packing' : 'Publishing'} ${manifest.name}`);

  if (dryRun) {
    await run('npm', ['pack', '--dry-run', '--json', '--cache', npmCacheDir], cwd);
    continue;
  }

  await run('npm', ['publish', '--cache', npmCacheDir, ...publishArgs], cwd);
}
