# ts-ethereum

> Full Ethereum execution and consensus client implementation in TypeScript (WIP).

What started off as a hobby solo project im turning into a full production ready execution client for the TS/JS ecosystems. the first of its kind. but probs wont be ready untik the end of the year. this is a huge undertaking. i dont want to opensource this or make releases until im happy with the state of it. Not production-ready. Expect breaking changes, missing features, and incomplete protocol coverage.

---

## Project status (today)

### In progress
- Smart contract support: working, but i have minimal support for most post megre hardfork and eip changes. im working on iy
- Testing suite: in progress

### To do / not started (planned)
- Consensus client: to do. lol probs wont start this at all since lodestar does this. but might make a minified lodestart for my own learnig purposes
- Execution client completeness (state, tx pool, block building/import, etc.): to do
- Wire protocol completeness, syncing, peer discovery hardening: to do
- Metrics/observability, fuzzing, long-run testing: to do

### Repo activity signals
- No releases published
- No issues or PRs currently open

---

## Notes
- See `PRODUCTION_QUALITY_COMPARISON.md` for perspective on what’s missing vs production clients.
- This repo uses Bun for the dev workflow.
