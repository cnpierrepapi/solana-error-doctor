# Resources, version matrix & sources

## When to use which MCP (this skill leans on tools already in the kit)

- **Helius MCP** — pull a failed transaction (`getTransaction`), simulate, estimate priority fees,
  inspect accounts. Used by `/diagnose-tx`. The deep *sending/landing* stack lives in Helius
  `core-ai`; this skill diagnoses and routes to it.
- **solana-dev MCP / docs** — authoritative current API surface for web3.js / kit, Anchor, SPL.
  Use it to confirm a method signature before recommending it (APIs drift).
- **A dedicated RPC** (any provider) — never diagnose landing/RPC errors against the public
  endpoint; it rate-limits and will mislead you.

## Version-compatibility matrix (the antidote to toolchain skew)

Pin a **consistent set**, don't mix:

| Layer | Guidance |
|---|---|
| Agave (CLI/validator) | Install the **latest official stable** (`release.anza.xyz/stable`) unless a project pins otherwise. |
| Rust (platform-tools) | Comes with Agave; it's what compiles your program. Don't fight it — match deps to it (see `toolchain-build.md`). |
| Anchor (on-chain `anchor-lang`) | 0.31+ through **1.x** (current **1.0.2**). Pin in `Anchor.toml` `[toolchain]`. |
| `@coral-xyz/anchor` (client) | **Same minor** as on-chain `anchor-lang`. |
| Lockfile | `cargo-build-sbf` may need **v3**; system Cargo ≥1.83 writes v4. Reconcile (see chapter). |
| sBPF `--arch` | Build with the latest toolchain, emit the **highest version the cluster enables** (devnet has accepted `--arch v3`). |

> Treat every specific number here as **VERIFY-before-ship** — run `solana --version`,
> `cargo-build-sbf --version`, `anchor --version`, and check the current Agave/Anchor release notes.

## Error-code quick reference

- **2000–2999** — Anchor constraint errors: 2001 `HasOne`, 2002 `Signer`, 2003 `Raw`, 2004 `Owner`,
  2006 `Seeds`, 2012 `Address`, 2019 `Space`.
- **3000–3999** — Anchor account errors: 3002 `AccountDiscriminatorMismatch`,
  3003 `AccountDidNotDeserialize`, 3004 `AccountDidNotSerialize`, 3012 `AccountNotInitialized`.
- **4100** — `DeclaredProgramIdMismatch` (`anchor keys sync`).
- **6000+ (0x1770+)** — your program's `#[error_code]` enum, in declaration order. Read the
  `#[msg("…")]`.
- Hex in logs → convert to decimal to map (`0x1770`=6000, `0x7d6`=2006).

## Primary sources (for verification, not blind trust)

The fixes in this skill are distilled from official docs and the teams that repeatedly publish on
these failures. Verify version-sensitive details against the live pages:

- Solana / Anza docs — transactions, versioned transactions, lookup tables, durable nonces, RPC.
- Anchor docs & release notes — constraints, `InitSpace`, IDL, `keys sync`, 0.32 changes.
- Helius docs/blog — priority fees & `getPriorityFeeEstimate`, sending under congestion,
  `getProgramAccountsV2`, DAS API, testing guide (LiteSVM/Surfpool).
- QuickNode guides — transaction optimization, offline/durable-nonce txs, LiteSVM.
- Jito docs — bundles, tip accounts (rotating — pull live), tip floor, block-engine endpoints.
- Pyth docs (`docs.pyth.network`) — Pull oracle, `PriceUpdateV2`, `get_price_no_older_than`.
- Switchboard docs (`docs.switchboard.xyz`) — On-Demand `PullFeed`.
- solana.stackexchange.com — the empirical frequency signal behind which errors this skill
  prioritizes.

## Scope boundary (what this skill is NOT)

It does not teach you to *build* programs, mint tokens, integrate Jupiter, or send production
transactions from scratch — those are owned, respectively, by `solana-dev-skill`, the token/NFT
skills, `jup-ag/agent-skills`, and Helius `core-ai`. This skill is the **diagnostic layer** that
gets you unstuck and points you to the right builder when you're ready to build.
