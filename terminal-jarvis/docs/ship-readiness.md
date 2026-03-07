# Ship Readiness Checklist

Use this checklist before publishing a release.

## Product Quality

- [ ] Vault context connected and returning relevant notes in desktop fast mode.
- [ ] Agent mode returns final response (no stuck `generating...` state).
- [ ] Queued prompts are processed after current response finishes.
- [ ] Typing remains responsive while streaming output.
- [ ] Default model is a fast local model (`qwen2.5:1.5b` preferred).

## Local Setup Experience

- [ ] Portable launcher auto-checks Ollama models (`qwen2.5` chat variants + `qwen2.5vl`/`llava` vision variants + `nomic-embed-text`).
- [ ] Linux bundle starts with `./run-jarvis.sh`.
- [ ] Windows bundle starts with `run-jarvis.bat`.
- [ ] Download links on website point to existing release assets.

## Validation Commands

Run from `terminal-jarvis`:

```bash
npm run check-env
npm run typecheck
npm run test
npm run smoke:cli
npm run smoke:api
npm run smoke:desktop
```

## Release Checks

- [ ] `v*` tag pushed (example: `v0.2.3`).
- [ ] GitHub Actions release workflow succeeded.
- [ ] Linux and Windows artifacts are attached to the release.
- [ ] Website release links updated to latest tag.

## Security Checks

- [ ] `JARVIS_API_KEY` configured for API usage outside trusted local loopback.
- [ ] `JARVIS_CORS_ORIGIN` not set to permissive `*` unless intentionally required.
- [ ] Sensitive vulnerabilities reported via `SECURITY.md` channel.
