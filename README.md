# Solana Error Doctor

**A diagnostic skill for AI coding agents: paste a Solana error → get the root cause and the fix that actually works on the 2026 stack.**

Every existing Solana skill teaches you how to *build* — Anchor, tokens, NFTs, transactions,
sending. None of them help when you're **stuck staring at an error** at 2am:

```
Error: A seeds constraint was violated
Error: lock file version 4 requires -Znext-lockfile-bump
Error: feature `edition2024` is required
Transaction simulation failed: Blockhash not found
ReferenceError: Buffer is not defined
```

The Solana Error Doctor is the skill you reach for **when something breaks**. It maps a symptom to
the one root cause and the verified fix, instead of a generic "here's how Anchor works" essay.

## Example session

```text
> /solana-debug A seeds constraint was violated

Diagnosis
  ConstraintSeeds (2006 / 0x7d6) — the PDA your client passed doesn't match the address
  the program re-derives from seeds = [...]. Almost always a seed *encoding* or *ordering*
  mismatch; the classic case is a u64 seed serialized big-endian on the client but
  little-endian (to_le_bytes) in the program.

Fix
  Make one derivation the source of truth and mirror it exactly on both sides:

    // client (web3.js)
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), authority.toBuffer(), new BN(id).toArrayLike(Buffer, "le", 8)],
      programId);

    // program (Anchor)
    #[account(seeds = [b"vault", authority.key().as_ref(), &id.to_le_bytes()], bump)]

Verify
  Log both addresses and assert equality BEFORE sending. If they differ, the seeds differ —
  fix the seeds, don't touch program logic.
```

> Want a live GIF? Record one in seconds with [`vhs`](https://github.com/charmbracelet/vhs) or
> [`asciinema`](https://asciinema.org), then drop it in this section.

## The problem it solves

These aren't edge cases — they're the most frequent, most-viewed questions on
`solana.stackexchange.com` and the recurring pain across Reddit, Discord, and every RPC provider's
blog. They're what makes Solana feel hard for new builders:

- **`ConstraintSeeds` / "A seeds constraint was violated"** — the #1 program error; a client/program
  PDA derivation mismatch.
- **Toolchain hell** — lockfile v4, `edition2024 required`, `sbpf_version not enabled`, version skew.
- **`Blockhash not found` / transactions that won't land** — the network model nobody explains up front.
- **`Buffer is not defined` / `bigint` bindings** — the single most-viewed Solana dev question.
- **8-byte discriminator / account `space` / "data too small"**, `getProgramAccounts` timeouts,
  token/ATA/Token-2022 gotchas, wallet-adapter SSR errors, and more.

Plus a chapter nothing else covers: **safely consuming Pyth & Switchboard price feeds** (the
pull-oracle model, staleness + confidence + feed-id checks) — where DeFi programs get exploited.

## How it works (progressive, token-efficient)

A short router (`skill/SKILL.md`) maps each symptom to **one** focused chapter, so the agent loads
only the ~1 file it needs instead of the whole knowledge base:

```
skill/
  SKILL.md            router: symptom → chapter (read this first)
  errors-index.json   machine-readable error-string / error-code → chapter map
  program-anchor.md   PDAs, seeds, has_one, discriminator, space, CPI signing, realloc
  toolchain-build.md  lockfile v4, edition2024, --arch/sBPF, keys sync, deploy cost
  transactions.md     blockhash, landing, priority fees, compute, ALTs, durable nonces
  tokens.md           transfer_checked, ATAs, rent reclaim, Token-2022 extensions
  rpc-data.md         getProgramAccounts(V2), 429s, DAS, parsing
  frontend-wallet.md  Buffer/bigint polyfills, wallet-adapter SSR, partial signing
  testing.md          LiteSVM (bankrun deprecated), Surfpool, validator flakiness
  oracles.md          Pyth Pull + Switchboard On-Demand: post-then-read, safety checks
  resources.md        version matrix, error-code reference, sources
commands/             /solana-debug  /diagnose-tx  /fix-build  /preflight
agents/               solana-debugger (the diagnostic persona)
```

The `errors-index.json` lets the `/solana-debug` command match an exact error string or program
error code (Anchor `2000–3999`, custom `6000+`) and jump straight to the fix.

## Commands

| Command | What it does |
|---|---|
| `/solana-debug <error>` | Paste any error/log/question → classified, routed, root cause + fix + verify step. |
| `/diagnose-tx <signature>` | Pulls a failed transaction (via a Solana RPC MCP, e.g. Helius), decodes the failure, gives the fix. |
| `/fix-build` | Walks a failing `anchor build` / `cargo build-sbf` / deploy through the toolchain decision tree. |
| `/preflight [deploy\|send\|frontend]` | Checklist that prevents the top errors before they happen. |

## Install

```bash
git clone https://github.com/<your-org>/solana-error-doctor
cd solana-error-doctor
./install.sh                 # installs into ~/.claude (or: ./install.sh /path/to/.claude)
```

Then restart your agent and try:

```
/solana-debug A seeds constraint was violated
```

`/diagnose-tx` works best with a Solana RPC MCP configured — copy `.mcp.json.example` to `.mcp.json`
and add a key (e.g. Helius). The skill still works without one; it will ask you to paste
`solana confirm -v <sig>` output instead.

## Design principles

- **Diagnose, don't duplicate.** This skill complements the ecosystem's builders and points to them
  (Anchor fundamentals → `solana-dev-skill`; production sending/landing → Helius `core-ai`;
  tokens/NFTs → the token/Metaplex skills). It does not rebuild what they already own.
- **Accurate over broad.** Fixes are current to the 2026 stack; version-sensitive details (rotating
  Jito tip accounts, platform-tools Rust version, evolving block compute limits) are flagged
  **VERIFY** rather than asserted stale.
- **Safe.** Irreversible mainnet actions (deploy, upgrade, authority changes) are never taken as part
  of "debugging" without explicit confirmation.

## Contributing

New symptom → cause → fix entries are welcome. Add the error signals/codes to `errors-index.json`
and the fix to the matching chapter, keeping the symptom → cause → fix → verify shape. Cite a
primary source for any concrete API claim, and mark version-sensitive facts **VERIFY**.

## License

MIT — see [LICENSE](LICENSE).
