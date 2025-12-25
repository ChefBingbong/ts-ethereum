# ts-ethereum

> Full Ethereum execution and consensus client implementation in TypeScript (WIP).

Not production-ready. Expect breaking changes, missing features, and incomplete protocol coverage.

---

## Getting started

### Prerequisites
- Bun (this repo was created with Bun tooling), but also supports Node.js.

Tip: If `index.ts` lives inside a package (common in monorepos), run it from that package directory or use the relevant workspace script once added.

---

## Project status (today)

### In progress
- Smart contract support: not yet (no EVM / contracts execution support currently) — in progress
- Testing suite: in progress

### To do / not started (planned)
- Consensus client: to do
- Execution client completeness (state, tx pool, block building/import, etc.): to do
- Wire protocol completeness, syncing, peer discovery hardening: to do
- Metrics/observability, fuzzing, long-run testing: to do

### Repo activity signals
- No releases published
- No issues or PRs currently open

---

## Roadmap (suggested milestones)

1. Networking foundation
   - Stable peer lifecycle
   - Message encoding/decoding + protocol versioning
   - Basic gossip/broadcast flows
2. Core data structures
   - Blocks, headers, transactions
   - Canonical chain selection (basic fork-choice rules)
3. Execution (no smart contracts → then contracts)
   - Start with minimal state + value transfers
   - Add EVM + smart contract execution (WIP)
4. Consensus client
   - Beacon-style consensus components (planned)
   - Fork-choice + validation pipeline
5. Testing + correctness
   - Unit + integration suites
   - Local multi-node simulations (docker/compose)
   - Regression tests for protocol edge-cases

---

## Notes
- See `PRODUCTION_QUALITY_COMPARISON.md` for perspective on what’s missing vs production clients.
- This repo uses Bun for the dev workflow.
