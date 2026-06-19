---
name: solana-error-doctor
description: >-
  Diagnose and fix Solana errors fast. Use this skill WHENEVER a Solana build,
  test, deploy, transaction, or frontend command fails — when the user pastes a
  Rust/Anchor/cargo error, a failed transaction signature or simulation log, a
  program error code (e.g. 0x1771 / 6001 / ConstraintSeeds), an RPC error
  (429, getProgramAccounts timeout, "Blockhash not found"), a wallet/bundler
  error ("Buffer is not defined", bigint bindings), or asks "why did my
  transaction fail / why won't this deploy / why doesn't my PDA match".
  Routes a symptom to the one chapter with the root cause and the verified 2026 fix.
license: MIT
---

# Solana Error Doctor

A **diagnostic** skill, not a tutorial. The Solana ecosystem already has excellent
"how to build X" skills; this is the one you reach for **when you are stuck and
staring at an error.** Symptom in → root cause + the fix that actually works on the
2026 stack (Agave/Anchor 0.31+/v1, Token-2022, versioned transactions, LiteSVM/Surfpool).

## How to use this skill (routing — read this, then load ONE chapter)

Do **not** load every chapter. Match the user's error to a row below, then read
**only** that chapter file. Each chapter is a self-contained symptom → cause → fix
reference. If the symptom is ambiguous, load `errors-index.json` (a machine-readable
symptom→chapter map keyed by error strings and program error codes) and match on the
exact error text.

| If the error / question is about… | Load this chapter |
|---|---|
| PDAs, `ConstraintSeeds` / "A seeds constraint was violated" (2006/0x7d6), `has_one`, signer/owner checks, `AccountDidNotDeserialize`, 8-byte discriminator, account `space` / "data too small", `invoke_signed` / CPI signing, realloc/rent | `program-anchor.md` |
| `anchor build`/`cargo build-sbf` failing, **lockfile version 4**, **edition2024 required**, Rust/Anchor/Agave version mismatch, `anchor keys sync` / `DeclaredProgramIdMismatch`, **`sbpf_version not enabled`** / `--arch`, deploy cost/rent/buffer, "current package believes it's in a workspace" | `toolchain-build.md` |
| **"Blockhash not found"**, transaction not landing / dropped, priority fees & compute-unit limits, `BlockHeightExceeded`, commitment levels (processed/confirmed/finalized), "Transaction too large" → Address Lookup Tables, durable nonces | `transactions.md` |
| SPL token transfers, `transfer` vs `transfer_checked`, Associated Token Accounts, "provided owner is not allowed", closing accounts to reclaim rent, **Token-2022** transfer-fee / transfer-hook gotchas | `tokens.md` |
| `getProgramAccounts` slow/timeout, RPC 429 / rate limits, `getProgramAccountsV2`, fetching NFTs/tokens (DAS API), parsing logs/transactions, indexing | `rpc-data.md` |
| **"Buffer is not defined"**, **"bigint: Failed to load bindings"**, wallet-adapter + Next.js/Vite SSR/hydration errors, partial-signing from the browser, "dApp may be malicious" | `frontend-wallet.md` |
| Tests failing/flaky, `solana-test-validator` won't start, **bankrun deprecated** → LiteSVM, Surfpool, mocha timeouts | `testing.md` |
| Consuming a price feed (**Pyth Pull**, **Switchboard On-Demand**), stale/zero price, confidence-interval checks, "price update not found", oracle account layout | `oracles.md` |
| Links, version-compatibility matrix, when to use which MCP, sources | `resources.md` |

## Diagnostic method (apply in every chapter)

1. **Read the exact error string and any numeric code.** Anchor custom errors start at
   **6000 (0x1770)**; framework errors are 2000–3000 (e.g. 2006 = `ConstraintSeeds`).
   `errors-index.json` maps codes → meaning.
2. **Locate the layer.** Build-time (toolchain), program-runtime (Anchor/account), client
   (RPC/serialization), network (landing/fees), or browser (bundler/wallet). The table above
   *is* the layer map.
3. **Confirm the root cause before changing code** — most Solana errors have a single,
   well-known cause; guessing wastes deploys. Each chapter states the cause first.
4. **Apply the minimal fix, then verify** (re-derive the PDA, re-simulate the tx, re-run the
   one failing test). Don't bundle unrelated changes.

## Companion commands

- `/solana-debug <pasted error or log>` — the hero entry point; classifies and routes.
- `/diagnose-tx <signature>` — pulls a failed transaction (Helius MCP) and decodes it.
- `/fix-build` — walks the toolchain decision tree on a failing `anchor build`/`cargo build-sbf`.
- `/preflight` — pre-deploy / pre-send checklist to prevent the top errors.

## Scope & honesty

- This skill **diagnoses**; for deep construction it points to the owning skill (e.g. Helius
  `core-ai` for advanced transaction-sending, `solana-dev-skill` for Anchor fundamentals,
  Metaplex for NFTs). It complements them, it does not duplicate them.
- Fixes are current to the **2026 stack**; version-sensitive items (Jito tip accounts, block
  compute-unit limits, platform-tools Rust version) are flagged in-chapter as **VERIFY**.
- Mainnet-affecting fixes (deploys, upgrades, authority changes) are called out before any
  irreversible step.
