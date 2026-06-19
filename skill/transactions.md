# Transaction landing & network errors

The tx was built and signed but **didn't land**, expired, or ran out of compute. This chapter
**diagnoses** the failure and gives the minimal fix. For a full production *sending* stack
(real-time fee estimation, connection warming, staked routing), defer to the **Helius `core-ai`**
skill (`priority-fees.md` + `sender.md`) — this chapter complements it, it does not replace it.

> Mental model: on Solana, **fees buy inclusion priority, not speed, and not guaranteed landing.**
> A tx lands when a leader includes it *before its blockhash expires* and *before it's outbid* on
> the congested accounts it touches (local fee markets).

---

## <a id="blockhash"></a>"Blockhash not found" / `TransactionExpiredBlockheightExceeded`

**Cause (almost always):** the recent blockhash **aged out** before the tx landed. A blockhash is
valid for only **~151 blocks (~60–90s)**. Slow signing, a long client queue, low priority fee (so it
never got included), or fetching the blockhash at the wrong commitment all cause it.

**Fixes (in order):**
1. **Fetch the blockhash as late as possible**, at `confirmed`, right before signing:
   `const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");`
2. **Track expiry, don't blind-retry:** resend the *same* signed tx every ~0.5–2s and poll
   `getSignatureStatus`; stop when `currentBlockHeight > lastValidBlockHeight` (then rebuild with a
   fresh blockhash).
3. **Make it actually land** (so it doesn't sit until expiry) — add a priority fee + correct CU
   limit (next sections).
4. **RPC mismatch:** simulate/send against the *same* RPC you fetched the blockhash from; a lagging
   node can "not find" a blockhash a faster node already has.
5. For txs that must outlive the window (offline/scheduled), use a **durable nonce** (below).

---

## <a id="landing"></a>Transaction not landing / dropped / "N not confirmed"

The canonical 2026 landing recipe (converged across Helius & QuickNode):

1. **Right-size compute units** — never ship the default 200k. Simulate, then set the limit:
   ```ts
   // simulate with a high CU ceiling to read consumption
   const sim = await conn.simulateTransaction(msg, { replaceRecentBlockhash: true, sigVerify: false });
   const units = Math.ceil((sim.value.unitsConsumed ?? 200_000) * 1.1);
   ix.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units }));
   ```
2. **Add a priority fee** sized to current congestion:
   ```ts
   ix.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
   ```
   Estimate `microLamports` from a fee API rather than guessing — Helius
   `getPriorityFeeEstimate` (`recommended:true` ≈ 50th pct, floored ~10,000 µ-lamports; bump to
   `high`/`veryHigh` under load) or QuickNode `qn_estimatePriorityFees`. Overpaying globally is
   wasteful — fees only spike on the *specific hot accounts* you touch (local fee markets).
3. **Disable RPC auto-retry and run your own loop:** send with `skipPreflight: true` and
   `maxRetries: 0`, then rebroadcast yourself until confirmed or blockhash-expired.
4. **Use a staked connection / SWQOS endpoint** under congestion — the single highest-leverage
   fix (e.g. a staked RPC, or a Jito bundle which rides Jito's stake). This is where Helius
   `core-ai` / `sender.md` earns its keep.
5. **Confirm correctly:** poll `getSignatureStatus`; treat `confirmed` as landed for UX,
   `finalized` for irreversibility.

> **Jito note (drift-prone, VERIFY):** Jito bundles send to `mainnet.block-engine.jito.wtf`
> (+ regional hosts), tip ≥ 1,000 lamports to one of the **rotating** tip accounts (always pull
> the current set from `getTipAccounts`, never hardcode long-term), min tip floor at
> `bundles.jito.wtf/api/v1/bundles/tip_floor`. Default block-engine rate limit ~1 req/s/IP/region.

---

## <a id="compute"></a>Compute budget exceeded

**Cause:** the tx used more than its CU limit. The **default is 200,000 CU** per tx regardless of
need; CPIs, loops, and big account (de)serialization blow past it. Hard ceiling per tx is
**1,400,000 CU**.

**Fix:** measure then set — simulate to read `unitsConsumed`, add ~10% margin, and
`setComputeUnitLimit({ units })` (snippet above). Don't just set it to 1.4M — an honest limit
*also lowers your priority-fee cost* (fee = price × limit) and helps scheduling.

> **VERIFY (in flux):** the long-standing **60M CU/block** cap is the subject of active proposals
> (SIMD-0370 / post-Alpenglow) to raise or remove it. Don't hardcode block-level assumptions.

---

## <a id="alt"></a>"Transaction too large" → versioned tx + Address Lookup Tables

**Cause:** a legacy transaction is capped at **1232 bytes**; too many accounts overflow it. Common
with DeFi composition (Jupiter routes, multi-account CPIs).

**Fix:** move to a **v0 (versioned) transaction** with an **Address Lookup Table**. Create and
extend the ALT once (it can hold up to 256 addresses), then compile a v0 message that references
it:
```ts
const lookup = (await conn.getAddressLookupTable(altAddress)).value!;
const msg = new TransactionMessage({ payerKey, recentBlockhash, instructions })
  .compileToV0Message([lookup]);
const tx = new VersionedTransaction(msg);
```
Reuse the same ALT across txs; creating one per tx defeats the purpose.

---

## <a id="nonce"></a>Durable nonces (offline / scheduled / long-lived txs)

When a tx must remain valid beyond the ~90s blockhash window (hardware-wallet/offline signing,
scheduled execution, multisig collection), use a **durable nonce** instead of a recent blockhash.
The nonce account stores a value that only advances when used.

- Use the nonce account's stored value as the tx's `recentBlockhash`.
- **`SystemProgram.nonceAdvance` (AdvanceNonceAccount) must be the FIRST instruction** in the tx —
  otherwise the nonce isn't consumed and the tx can replay or fail.

---

## Commitment levels (the quiet cause of "it worked then didn't")

- `processed` — fastest, **can be rolled back**; never confirm money movement on this.
- `confirmed` — voted by a supermajority; the right default for UX and for fetching blockhashes.
- `finalized` — irreversible; use for settlement and for anything you'll act on irreversibly.

Mixing levels (e.g. fetch blockhash at `finalized`, send at `processed`) produces flaky
"blockhash not found" and premature "success." Pick `confirmed` consistently unless you have a
reason not to.

---

### When to escalate
- The tx is *rejected by program logic* (constraint/error code), not a landing problem →
  `program-anchor.md`. Use `/diagnose-tx <sig>` to see which.
- The send fails with 429 / RPC errors → `rpc-data.md`.
