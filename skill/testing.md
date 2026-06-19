# Testing & local-validator errors

Tests are slow, flaky, or won't start. The 2026 answer is mostly: **stop using a full local
validator for unit tests** and move to an in-process SVM.

---

## <a id="litesvm"></a>`solana-bankrun` is deprecated → migrate to LiteSVM

**Cause:** `solana-bankrun` (and its `anchor-bankrun` wrapper) is **deprecated/unmaintained** as of
early 2025. New projects should use **LiteSVM** — the SVM runtime in-process, no validator, no RPC,
millisecond tests, with direct control over slots, clock, and sysvars.

**Fix / migration shape:**
- TS: `litesvm` (`LiteSVM`) — `svm.addProgramFromFile(programId, "target/deploy/x.so")`, build
  transactions, `svm.sendTransaction(tx)`, read accounts directly. Set the clock for time-dependent
  logic with `svm.setClock(...)`.
- Rust: `litesvm` crate (same idea, native).
- It runs **deterministically** and lets you set arbitrary account state — ideal for edge cases a
  validator makes painful (warping time, pre-seeding accounts, simulating other programs).

Keep a *small* number of full-validator/devnet integration tests for the things LiteSVM can't model
(real CPIs to programs you don't have the `.so` for, actual network behavior).

---

## <a id="validator"></a>`solana-test-validator` won't start / `blockstore error` / flaky

**Causes & fixes:**
- **Stale ledger / `blockstore error`** (common on macOS after an unclean exit): delete the ledger
  and restart — `rm -rf test-ledger` (or `solana-test-validator --reset`). A struct-layout change
  also leaves old accounts that now fail to deserialize; reset clears them.
- **Port already in use / a previous validator still running:** kill the old process before
  starting a new one.
- **Slow startup / mocha timeouts:** increase the test timeout, and prefer **Surfpool** — Anchor
  now defaults `anchor test`/`localnet` to **Surfpool** (mainnet account mirroring + cheatcodes),
  with `--validator legacy` to fall back to `solana-test-validator`. Surfpool lets you fork mainnet
  state so you can test against real accounts (mints, programs) without seeding them by hand.

---

## <a id="flaky"></a>Flaky `anchor test` / `ts-mocha` issues

- **Airdrop/await races:** `await` every airdrop and confirm it before using the lamports; don't
  fire-and-forget. On a fresh validator, confirm at `confirmed` and check the balance.
- **Shared state between tests:** each test reusing the same PDA can collide — use fresh
  keypairs/seeds per test, or reset the ledger between runs.
- **Timeouts on first compile:** the first `anchor test` builds the program; raise the mocha
  timeout so the build doesn't count against the first test.
- **`ts-mocha`/ESM dependency friction:** pin `@coral-xyz/anchor` to match the on-chain version, and
  keep `ts-node`/`typescript`/`mocha` versions consistent with the Anchor template you started from.

---

### When to escalate
- The test fails because the *program* rejects the tx (constraint/error code) → `program-anchor.md`.
- The toolchain won't build the program for tests at all → `toolchain-build.md`.
