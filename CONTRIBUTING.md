# Contributing to Jarvis

Thanks for your interest in contributing.

This repo contains the active project at `terminal-jarvis/`. Contributions across code, docs, tests, UX, and packaging are welcome.

## Before You Start

1. Check existing issues and PRs first.
2. Open an issue for larger changes before implementing.
3. Keep changes scoped and reviewable.

## Local Setup

```bash
cd terminal-jarvis
npm ci
npm run check-env
npm run build
```

## Development Commands

- CLI: `npm run dev:cli`
- API: `npm run dev:api`
- Desktop: `npm run dev:desktop`
- Site: `npm run dev:site`

## Quality Gates (required before PR)

```bash
npm run lint
npm run typecheck
npm run test
npm run smoke:cli && npm run smoke:api && npm run smoke:desktop
```

## Branch and PR Flow

1. Fork the repo.
2. Create a branch:
   - `feat/<short-topic>`
   - `fix/<short-topic>`
   - `docs/<short-topic>`
3. Commit with clear messages.
4. Open a PR against `main`.

## PR Expectations

- Explain what changed and why.
- Include screenshots/GIFs for UI changes.
- Mention any behavior changes and migration notes.
- Keep unrelated changes out of the same PR.

## Coding Notes

- Node runtime target is `22.x`.
- Keep local-first behavior intact.
- Avoid introducing cloud dependencies for baseline features.
- If adding security tradeoffs, document them in README and/or SECURITY.md.

## Good First Contributions

- Docs and onboarding improvements
- Test coverage for edge cases
- Desktop UX and performance polish
- Packaging and installer reliability
- Security hardening with feature parity

If you want a starter task, open an issue and ask for a `good first issue`.
