# Program & Anchor errors

The largest pain cluster on Solana. These are **program-runtime** errors: the program
compiled and deployed, but a transaction is rejected by your account constraints or
account (de)serialization. Anchor framework errors live in **2000–3999**; your own
`#[error_code]` enum starts at **6000 (0x1770)** in declaration order.

> Convert hex codes from logs: `0x1770`=6000, `0x1771`=6001, `0x7d6`=2006, `0x7d3`=2003,
> `0xbba`=3002. A code ≥ 6000 means *your* error enum — count from 6000.

---

## <a id="seeds-constraint"></a>"A seeds constraint was violated" — `ConstraintSeeds` (2006 / 0x7d6)

**The single most common Solana program error.** It means the PDA you passed does not
equal the address Anchor re-derives on-chain from `seeds = [...]` (+ the canonical bump).

**Root cause — one of:**
1. **Seed order differs** between client and program. Order is significant.
2. **Byte encoding differs.** `"counter"` vs a `Pubkey`'s 32 bytes vs a `u64`. Numbers must
   match width and endianness — Anchor/Rust `u64` seeds are **little-endian 8 bytes**.
3. **Wrong/extra/missing bump.** The program uses the *canonical* bump; the client must use
   the same one (`findProgramAddressSync` returns it — use it, don't hardcode).
4. **Wrong base inputs** — a different authority/owner/mint than the program expects.

**Fix — make one derivation the source of truth and test it:**

```ts
// client (web3.js) — MUST mirror the program's seeds exactly, in order
const [pda, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), authority.toBuffer(), new BN(id).toArrayLike(Buffer, "le", 8)],
  programId,
);
```
```rust
// program (Anchor) — same seeds, same order, same encoding
#[account(seeds = [b"vault", authority.key().as_ref(), &id.to_le_bytes()], bump)]
pub vault: Account<'info, Vault>,
```

**Verify before anything else:** log both addresses and assert equality. If they differ, the
seeds differ — do not change program logic until the derived keys match. Common silent bug:
client uses `toArrayLike(Buffer, "be", 8)` (big-endian) while Rust uses `to_le_bytes()`.

---

## <a id="has-one"></a>"A has_one constraint was violated" — `ConstraintHasOne` (2003 / 0x7d3)

`has_one = authority` means *the `authority` field stored on this account must equal the
`authority` account you passed.* The error = they differ.

**Fix:** pass the account whose key matches the stored field. Check you didn't swap two
accounts of the same type in the instruction, and that the account was initialized with the
authority you think it has. `has_one` compares **stored field → passed account key**, not the
signer — pair it with `Signer` if you also need a signature.

---

## <a id="discriminator"></a>`AccountDidNotDeserialize` / `AccountDiscriminatorMismatch` (3002 / 3003)

Every Anchor account begins with an **8-byte discriminator** (hash of the account name).
Deserialization fails when:

- You passed the **wrong account type** (discriminator of a different struct).
- You **changed the struct's fields** and read an old account written with the old layout —
  there is no automatic migration. Add a version field and migrate, or close + reinit in dev.
- You're reading a **raw/uninitialized** account as an Anchor account.

**Fix:** confirm the account type at the call site; for layout changes, migrate existing
accounts (realloc + rewrite) or wipe them on devnet. In tests, a stale local ledger causes
this after a struct change — clear it.

---

## <a id="space"></a>"data too small" / `AccountDidNotSerialize` (3004) — account `space`

You under-allocated the account. The #1 cause: **forgetting the 8-byte discriminator.**

**Fix — let Anchor compute it (0.31+):**

```rust
#[account(init, payer = payer, space = 8 + Counter::INIT_SPACE)]
pub counter: Account<'info, Counter>,
// ...
#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub authority: Pubkey,     // 32
    pub count: u64,            // 8
    #[max_len(50)] pub label: String, // 4 + 50
}
```

`8 +` is the discriminator; `INIT_SPACE` is the struct body (use `#[max_len(N)]` for `Vec`/
`String`). Never hand-count if you can derive it. If you must store dynamically growing data,
see realloc below.

---

## <a id="signer-owner"></a>Missing signature / `ConstraintSigner` (2002) and owner checks

- **"missing required signature"** — an account typed `Signer<'info>` (or marked `mut` and
  expected to sign, like a payer) was not passed as a signer client-side, or you tried to make
  a PDA sign normally (PDAs sign only via `invoke_signed`, below).
- **Account validation footgun (security):** if you take a raw `AccountInfo`/`UncheckedAccount`
  without checking owner/type, an attacker can pass a look-alike account. Prefer
  `Account<'info, T>` (checks owner == your program **and** the discriminator), `Signer`,
  `Program`, and constraints (`has_one`, `address = …`, `constraint = …`). Only use
  `UncheckedAccount` with an explicit `/// CHECK:` justification and a manual check.

---

## <a id="cpi-signing"></a>PDA signing in CPIs — `invoke_signed`

A PDA has no private key; it "signs" a CPI only when the runtime is given its **seeds + bump**
and the calling program owns it.

```rust
let seeds = &[b"vault", authority.key().as_ref(), &[ctx.bumps.vault]];
let signer = &[&seeds[..]];
transfer(CpiContext::new_with_signer(token_program, accounts, signer), amount)?;
```

**Errors you'll see if this is wrong:** "Cross-program invocation with unauthorized signer"
or signature failures. Causes: seeds/bump don't match the PDA being signed for, or you used
`CpiContext::new` (no signer) for a PDA-authority transfer. In Anchor 0.30+ the bumps are in
`ctx.bumps.<account_name>`.

---

## <a id="realloc"></a>Realloc & rent: `AccountNotRentExempt`, resize limits

- A single instruction can grow an account by at most **10,240 bytes**; initial `init` space
  ≤ ~10 KiB. For larger, realloc across multiple instructions.
- After growing, the account must remain **rent-exempt** — transfer additional lamports to
  cover the new minimum (`Rent::get()?.minimum_balance(new_len)`), or the tx fails with
  `AccountNotRentExempt`/insufficient funds.
- **Reclaiming rent:** closing an account (`close = destination` in Anchor, or
  `closeAccount`/`CloseAccount` for token accounts) returns its lamports. This is the answer to
  "how do I get my SOL back from accounts I no longer need."

---

### When to escalate out of this chapter
- Error code ≥ 6000 → it's *your* program's logic error; read the `#[msg("…")]` text.
- The program never even ran (build/deploy failed) → `toolchain-build.md`.
- The tx failed to *land* (not a constraint) → `transactions.md`.
