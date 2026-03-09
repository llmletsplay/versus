import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const packagesDir = join(root, 'packages');

async function ensureFile(filePath) {
  await access(filePath);
}

async function assertNoCompiledSourceArtifacts(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await assertNoCompiledSourceArtifacts(fullPath);
      continue;
    }

    if (/\.(?:js|js\.map|d\.ts|d\.ts\.map)$/.test(entry.name)) {
      throw new Error(`Compiled source artifact found in package source tree: ${fullPath}`);
    }
  }
}

const entries = await readdir(packagesDir, { withFileTypes: true });

for (const entry of entries) {
  if (!entry.isDirectory()) {
    continue;
  }

  const packageDir = join(packagesDir, entry.name);
  const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
  const readme = await readFile(join(packageDir, 'README.md'), 'utf8');
  const license = await readFile(join(packageDir, 'LICENSE'), 'utf8');
  const isGamePackage = entry.name !== 'game-core';
  const expectedFiles = isGamePackage
    ? ['dist', 'README.md', 'RULES.md', 'LICENSE']
    : ['dist', 'README.md', 'LICENSE'];
  const expectedName = isGamePackage
    ? `@llmletsplay/versus-${entry.name}`
    : '@llmletsplay/versus-game-core';

  if (manifest.name !== expectedName) {
    throw new Error(`${entry.name} must publish as ${expectedName}`);
  }

  if (manifest.publishConfig?.access !== 'public') {
    throw new Error(`${manifest.name} must publish publicly`);
  }

  if (manifest.repository?.directory !== `packages/${entry.name}`) {
    throw new Error(`${manifest.name} must declare its package directory in repository.directory`);
  }

  for (const groupName of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dependencyName of Object.keys(manifest[groupName] ?? {})) {
      if (dependencyName.startsWith('@versus/')) {
        throw new Error(`${manifest.name} still references legacy scope dependency ${dependencyName}`);
      }
    }
  }

  if (JSON.stringify(manifest.files) !== JSON.stringify(expectedFiles)) {
    throw new Error(`${manifest.name} has an unexpected files array: ${JSON.stringify(manifest.files)}`);
  }

  if (manifest.main !== './dist/index.js' || manifest.types !== './dist/index.d.ts') {
    throw new Error(`${manifest.name} must publish dist entrypoints`);
  }

  if (manifest.exports?.['.']?.import !== './dist/index.js' || manifest.exports?.['.']?.types !== './dist/index.d.ts') {
    throw new Error(`${manifest.name} must export the built dist entrypoint`);
  }

  if (manifest.scripts?.build !== 'tsc -p tsconfig.json' || manifest.scripts?.prepack !== 'npm run build') {
    throw new Error(`${manifest.name} must keep the standard build and prepack scripts`);
  }

  if (!readme.includes('## Install') || !readme.includes('## Quick Start')) {
    throw new Error(`${manifest.name} README is missing install or quick-start sections`);
  }

  if (!license.includes('MIT License')) {
    throw new Error(`${manifest.name} LICENSE file is missing or invalid`);
  }

  if (isGamePackage) {
    const rules = await readFile(join(packageDir, 'RULES.md'), 'utf8');

    if (!readme.includes('[RULES.md](./RULES.md)')) {
      throw new Error(`${manifest.name} README does not link to RULES.md`);
    }

    for (const section of ['## Objective', '## Players', '## Setup', '## Turn Structure', '## End Of Game']) {
      if (!rules.includes(section)) {
        throw new Error(`${manifest.name} RULES.md is missing ${section}`);
      }
    }
  }

  await ensureFile(join(packageDir, 'dist', 'index.js'));
  await ensureFile(join(packageDir, 'dist', 'index.d.ts'));
  await assertNoCompiledSourceArtifacts(join(packageDir, 'src'));
}

console.log('All packages satisfy the release docs, manifest, and built-artifact contract.');
