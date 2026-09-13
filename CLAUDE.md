# Instructions

Read [AI_INDEX.md](AI_INDEX.md) before making any code changes. It is the navigation manifest for this codebase — every module, how they connect, where to look. Do not guess file locations or module responsibilities; check AI_INDEX first.

## Key rules

- Zero-dependency philosophy: no new npm dependencies without discussion
- All changes must pass existing tests: `node --test tests/unit/` and `npx playwright test`
- Frontend has no build step — vanilla JS served as static files from `src/ui/`
- CSS uses OKLch color variables for automatic light/dark mode support
