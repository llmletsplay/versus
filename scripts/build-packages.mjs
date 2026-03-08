import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed in ${cwd} with exit code ${code}`));
    });

    child.on('error', reject);
  });
}

const root = process.cwd();
const packagesDir = join(root, 'packages');
const entries = await readdir(packagesDir, { withFileTypes: true });
const manifests = [];

for (const entry of entries) {
  if (!entry.isDirectory()) {
    continue;
  }

  const cwd = join(packagesDir, entry.name);
  const manifestPath = join(cwd, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifests.push({ cwd, manifest });
}

const workspacePackageNames = new Set(manifests.map(({ manifest }) => manifest.name));
const manifestByName = new Map(manifests.map((entry) => [entry.manifest.name, entry]));
const orderedBuilds = [];
const visiting = new Set();
const visited = new Set();

function visit(packageName) {
  if (visited.has(packageName)) {
    return;
  }

  if (visiting.has(packageName)) {
    throw new Error(`Circular workspace package dependency detected for ${packageName}`);
  }

  const entry = manifestByName.get(packageName);
  if (!entry) {
    return;
  }

  visiting.add(packageName);

  const dependencyGroups = [
    entry.manifest.dependencies,
    entry.manifest.peerDependencies,
    entry.manifest.optionalDependencies,
  ];

  for (const group of dependencyGroups) {
    for (const dependencyName of Object.keys(group ?? {})) {
      if (workspacePackageNames.has(dependencyName)) {
        visit(dependencyName);
      }
    }
  }

  visiting.delete(packageName);
  visited.add(packageName);

  if (entry.manifest.scripts?.build) {
    orderedBuilds.push(entry);
  }
}

for (const { manifest } of manifests) {
  visit(manifest.name);
}

for (const { cwd, manifest } of orderedBuilds) {
  console.log(`\n==> Building ${manifest.name}`);
  await run('npm', ['run', 'build'], cwd);
}
