# Token (SPL & Token-2022) errors

Token bugs are mostly about **which program owns the mint**, **Associated Token Accounts**, and
**decimals**. Two token programs now coexist: classic **SPL Token**
(`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`) and **Token-2022 / Token Extensions**
(`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`). Using the wrong one is a top source of "account
not found" / "invalid account owner".

---

## <a id="transfer-checked"></a>`transfer` vs `transfer_checked`

Prefer **`transfer_checked`** (and `mint_to_checked`, `burn_checked`). It takes the **mint** and
**decimals** and validates them, which:
- catches sending the wrong mint or wrong-decimals amount, and
- is **required** for Token-2022 mints with transfer fees/hooks (the plain `transfer` can't account
  for them).

The classic `transfer` (no mint/decimals) still works for plain SPL but is the legacy path; new
code should use the checked variants. `0x4` / `TokenError` on a transfer usually means owner or
amount/decimals mismatch.

---

## <a id="ata"></a>Associated Token Accounts: "provided owner is not allowed", "account not found"

- An ATA is a **PDA derived from (owner, mint, token_program)**. There is exactly one canonical
  ATA per triple.
- **"Provided owner is not allowed"** when deriving/creating: the owner must be a normal system
  account **or**, for a PDA owner (e.g. a vault), you must pass `allowOwnerOffCurve = true`:
  ```ts
  const ata = getAssociatedTokenAddressSync(mint, ownerPda, /* allowOwnerOffCurve */ true);
  ```
- **"TokenAccountNotFound" / "could not find account"**: the ATA hasn't been created yet. Creating
  it for a non-existent owner is fine (the owner is just a pubkey), but you must *create the ATA*
  before transferring into it:
  ```ts
  createAssociatedTokenAccountInstruction(payer, ata, owner, mint, tokenProgramId);
  ```
- **Wrong token program:** pass the Token-2022 program id to all ATA/transfer helpers when the mint
  is a Token-2022 mint, or the derivation/owner check fails. Check the mint's owner first:
  `(await conn.getAccountInfo(mint)).owner` tells you which token program it belongs to.

---

## <a id="rent"></a>Reclaiming rent: closing token accounts

Empty token accounts hold rent you can recover. Use `closeAccount` (web3.js `createCloseAccountInstruction`)
to send the rent lamports to a destination. The account must have **zero token balance** first
(burn or transfer out the remainder). This is the answer to "how do I get SOL back from old token
accounts."

---

## <a id="token-2022"></a>Token-2022 extension gotchas

Token-2022 mints carry **extensions** that change behavior and the accounts a transfer needs:

- **Transfer Fee (`TransferFeeConfig`)** — the recipient receives **less than the sent amount**; a
  fee is withheld on the destination account. If your accounting assumes amount-in == amount-out,
  it breaks. Read the fee config and use `transfer_checked`; harvest withheld fees with the
  transfer-fee instructions.
- **Transfer Hook** — every transfer CPIs into a hook program and requires **extra accounts** the
  hook declares (resolve them via the hook's `ExtraAccountMetaList`; SDKs have
  `resolveExtraAccountMeta`/`addExtraAccountsToInstruction`). Missing these → the transfer fails.
- **ImmutableOwner** — Token-2022 ATAs are immutable-owner by default; you can't reassign them.
- **Mint size** — a Token-2022 mint with extensions is larger than a classic mint; allocate with
  `getMintLen([extensions])`, not the fixed classic size, or `init` fails.

**Diagnosis tip:** if a token works in one wallet/SDK call and fails in another, check whether it's
a Token-2022 mint and whether the failing path passed the Token-2022 program id and extension
accounts.

---

### When to escalate
- Building a token / mint workflow from scratch → `solana-foundation/solana-dev-skill`
  (`token-2022.md`) or `sendaifun` launch-token; this chapter is for *fixing* token errors.
- The transfer fails to *land* (not a token error) → `transactions.md`.
