import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const args = process.argv.slice(2);
const targetIndex = args.indexOf('--target');
const versionArg = args.find((arg) => arg.startsWith('--package-version='));
const packageVersion = versionArg?.slice('--package-version='.length) ?? '^0.1.0';

if (targetIndex === -1 || !args[targetIndex + 1]) {
  console.error('Usage: node scripts/export-platform-repo.mjs --target <path> [--package-version=^0.1.0]');
  process.exit(1);
}

const targetDir = resolve(args[targetIndex + 1]);
const copyEntries = [
  '.env.example',
  '.nvmrc',
  'LICENSE',
  'Makefile',
  'docker-compose.yml',
  'versus-server',
  'versus-client',
  'versus-skill',
];
const skippedNames = new Set([
  '.git',
  '.npm-cache',
  'node_modules',
  'dist',
  'coverage',
  'build',
  'package-lock.json',
  'bun.lock',
  'bun.lockb',
]);

const shouldCopy = (source) => !skippedNames.has(basename(source));

await mkdir(targetDir, { recursive: true });

for (const entry of copyEntries) {
  await cp(join(root, entry), join(targetDir, entry), {
    recursive: true,
    force: true,
    filter: shouldCopy,
  });
}

const platformRootPackage = {
  name: 'versus-platform',
  version: '0.1.0',
  private: true,
  type: 'module',
  workspaces: ['versus-server', 'versus-client', 'versus-skill'],
  scripts: {
    dev: 'concurrently "npm run dev:server" "npm run dev:client"',
    'dev:server': 'npm --prefix versus-server run dev',
    'dev:client': 'npm --prefix versus-client run dev',
    'dev:skill': 'npm --prefix versus-skill run build',
    build: 'npm run build:server && npm run build:client',
    'build:server': 'npm --prefix versus-server run build',
    'build:client': 'npm --prefix versus-client run build',
    test: 'npm --prefix versus-server run test',
    'test:games': 'npm --prefix versus-server run test:games',
    lint: 'npm --prefix versus-server run lint',
    'type-check': 'npm --prefix versus-server run type-check',
    format: 'npm --prefix versus-server run format',
    'docker:up': 'docker-compose up -d',
    'docker:down': 'docker-compose down',
  },
  devDependencies: {
    concurrently: '^9.1.0',
  },
};
await writeFile(join(targetDir, 'package.json'), JSON.stringify(platformRootPackage, null, 2) + '\n');

const platformReadme = `# Versus Platform

Versus Platform is the application repository for rooms, auth, betting, prediction markets, intents, and settlement flows built on top of the published Versus game packages.

## Local Setup

\`\`\`bash
npm install
docker-compose up -d
npm run dev
\`\`\`

## Dependency Model

The server in this repo consumes published packages such as \`@llmletsplay/versus-chess\` and \`@llmletsplay/versus-game-core\` from npm instead of local workspace links.
`;
await writeFile(join(targetDir, 'README.md'), platformReadme);

const platformGitignore = `node_modules/
dist/
build/
coverage/
logs/
*.log
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
.idea/
*.tsbuildinfo
.npm-cache/
`;
await writeFile(join(targetDir, '.gitignore'), platformGitignore);

const workflowDir = join(targetDir, '.github', 'workflows');
await mkdir(workflowDir, { recursive: true });
const platformCi = `name: CI

on:
  push:
    branches: [dev, main]
  pull_request:
    branches: [dev, main]

concurrency:
  group: platform-ci-${'${{ github.ref }}'}
  cancel-in-progress: true

jobs:
  checks:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: npm install

      - name: Lint server
        run: npm --prefix versus-server run lint

      - name: Type-check server
        run: npm --prefix versus-server run type-check

      - name: Run server tests
        run: npm --prefix versus-server run test

      - name: Build server
        run: npm --prefix versus-server run build

      - name: Build client
        run: npm --prefix versus-client run build
`;
await writeFile(join(workflowDir, 'ci.yml'), platformCi);

const serverPackagePath = join(targetDir, 'versus-server', 'package.json');
const serverPackage = JSON.parse(await readFile(serverPackagePath, 'utf8'));
for (const [name, value] of Object.entries(serverPackage.dependencies ?? {})) {
  if (name.startsWith('@llmletsplay/versus-') && typeof value === 'string' && value.startsWith('file:../packages/')) {
    serverPackage.dependencies[name] = packageVersion;
  }
}
serverPackage.description = 'Platform server for the Versus application repo';
await writeFile(serverPackagePath, JSON.stringify(serverPackage, null, 2) + '\n');

const envExamplePath = join(targetDir, '.env.example');
let envExample = await readFile(envExamplePath, 'utf8');
envExample = envExample.replace('COMPOSE_PROJECT_NAME=versus', 'COMPOSE_PROJECT_NAME=versus-platform');
await writeFile(envExamplePath, envExample);

console.log(`Exported platform repo skeleton to ${targetDir}`);
console.log('Next steps:');
console.log(`  cd ${targetDir}`);
console.log('  npm install');
console.log('  git add .');
console.log('  git commit -m "feat: bootstrap platform repo from versus"');