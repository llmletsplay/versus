import process from 'node:process';
import { getWorkspacePackages, orderWorkspacePackages, run } from './package-workspace.mjs';

const root = process.cwd();
const manifests = await getWorkspacePackages(root);
const orderedBuilds = orderWorkspacePackages(manifests).filter(
  ({ manifest }) => Boolean(manifest.scripts?.build),
);

for (const { cwd, manifest } of orderedBuilds) {
  console.log(`\n==> ${manifest.name}`);
  await run('npm', ['run', 'build'], cwd);
}
