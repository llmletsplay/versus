import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { getWorkspacePackages, orderWorkspacePackages, run } from './package-workspace.mjs';

const root = process.cwd();
const npmCacheDir = join(root, '.npm-cache');
await mkdir(npmCacheDir, { recursive: true });

const rawArgs = process.argv.slice(2);
const dryRun = rawArgs.includes('--dry-run');
const fromArg = rawArgs.find((arg) => arg.startsWith('--from='));
const fromPackage = fromArg ? fromArg.slice('--from='.length) : null;
const publishArgs = rawArgs.filter((arg) => arg !== '--dry-run' && !arg.startsWith('--from='));
const manifests = await getWorkspacePackages(root);
const orderedPackages = orderWorkspacePackages(manifests);
const startIndex = fromPackage
  ? orderedPackages.findIndex(({ manifest }) => manifest.name === fromPackage)
  : 0;

if (fromPackage && startIndex === -1) {
  throw new Error(`Unknown package passed to --from: ${fromPackage}`);
}

const packagesToProcess = orderedPackages.slice(startIndex);

for (const { cwd, manifest } of packagesToProcess) {
  console.log(`\n==> ${dryRun ? 'Packing' : 'Publishing'} ${manifest.name}`);

  if (dryRun) {
    await run('npm', ['pack', '--dry-run', '--json', '--cache', npmCacheDir], cwd);
    continue;
  }

  await run('npm', ['publish', '--cache', npmCacheDir, ...publishArgs], cwd);
}