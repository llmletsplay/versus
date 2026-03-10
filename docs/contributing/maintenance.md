# Maintenance Flow

This repo is meant to stay pretty calm. The game engines should not change
dramatically very often, so the workflow can stay lightweight.

## Repo Focus

- reusable game engines
- package docs and examples
- package-focused tests
- npm publishing and release checks

## Day-To-Day Git Flow

1. Create short-lived branches from `dev`.
2. Open pull requests into `dev`.
3. Let CI run on `dev` and `main`.
4. Batch a few good changes together.
5. Merge `dev` into `main` when you want a stable cut.

That gives you one branch for normal work and one branch for the stable public release line.

## Branch Protection

Recommended GitHub settings:

- `dev`: require pull requests and passing CI
- `main`: require pull requests and passing CI
- allow admin override for emergencies, but do not make force-push the normal path

## GitHub Actions In This Repo

Keep this repo focused on package health:

- `ci.yml`: runs package checks, game tests, and package-test-harness lint/type-check on `dev` and `main`
- `publish-packages.yml`: manual workflow that publishes the npm package set from `main`

This repo does not need application deployment automation because it is the package
library itself, not a host product.

## NPM Publishing

Only publish from `main` and only when package code, package docs, or examples changed.

Typical release steps:

1. Merge the release batch into `main`.
2. Bump package versions.
3. Run the manual publish workflow in GitHub or `npm run publish:packages` locally.
4. Verify a couple of packages on npm after publish.

Use an `NPM_TOKEN` secret in GitHub for the manual package publish workflow.

## What To Keep Lightweight

- prefer one good CI workflow over several overlapping ones
- avoid publishing for every tiny internal tweak
- keep docs succinct and current
- keep tests real and deterministic
- keep app-specific concerns outside the public engine repo

## Suggested Rhythm

A relaxed maintenance cadence is enough:

- fix bugs and docs as they come up on `dev`
- merge to `main` when a batch feels worth releasing
- publish packages when consumers actually benefit from the change
- let host applications upgrade on their own cadence