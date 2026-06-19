# Oracles: consuming Pyth & Switchboard price feeds (and the errors)

A genuine ecosystem gap: there is no skill for **safely consuming price feeds**, yet it's where
DeFi programs get exploited (stale prices, unchecked confidence, zero prices). Both major oracles
on Solana are now **pull-based** — the price is *not* sitting on-chain by default; **you (or a
crank) must post a fresh update**, then read it the same transaction. Getting that wrong is the
root of almost every oracle error below.

> **Mental-model shift (this trips everyone):** the old Pyth model had a permanent price account you
> could just read. The current **Pyth Pull** and **Switchboard On-Demand** models require you to
> **fetch an update off-chain → post it on-chain → read it with a staleness bound.** If you only
> "read", you get *no account* or a *stale* price.

> **VERIFY (drift-prone):** crate/SDK names, versions, and method signatures below move. Confirm
> against the current Pyth (`docs.pyth.network`) and Switchboard (`docs.switchboard.xyz`) docs
> before shipping. The *patterns* (post-then-read, check staleness + confidence + feed id) are
> stable; the exact calls are what change.

---

## Pyth (Pull oracle)

**Off-chain (client):** use `@pythnetwork/pyth-solana-receiver` + the **Hermes** service to fetch a
signed price update for your **feed id** (a 32-byte hex string per symbol, e.g. SOL/USD), and get
instructions that **post** it, creating an ephemeral `PriceUpdateV2` account. Bundle those post
instructions with your program instruction in one transaction so the update is fresh when your
program reads it. Close the ephemeral account afterward to reclaim rent.

**On-chain (program, via `pyth-solana-receiver-sdk`):**
```rust
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};

let feed_id = get_feed_id_from_hex(SOL_USD_HEX)?;          // your expected feed
let price = price_update.get_price_no_older_than(
    &Clock::get()?,
    MAXIMUM_AGE_SECS,                                       // staleness bound, e.g. 60
    &feed_id,                                               // asserts the account is THIS feed
)?;
// price.price (i64), price.conf (u64), price.exponent (i32)
// real_price = price.price as f64 * 10f64.powi(price.exponent)
```

**Must-do safety checks (skipping these = the exploit):**
1. **Staleness** — always use `get_price_no_older_than(maximum_age, …)`, never an unbounded read.
2. **Feed id** — pass the expected `feed_id` so an attacker can't substitute a different feed's
   update account.
3. **Confidence** — reject if `conf` is too wide relative to `price` (e.g. `conf * X > price`); a
   huge confidence band means the oracle isn't sure.
4. **Exponent** — apply `exponent` (prices are integer mantissa × 10^exponent); forgetting it gives
   answers off by orders of magnitude.

---

## Switchboard (On-Demand)

**Off-chain:** `@switchboard-xyz/on-demand` — load the `PullFeed`, call its
fetch-update routine to get an instruction that submits fresh signed oracle samples, and bundle it
ahead of your program instruction in the same tx.

**On-chain (`switchboard-on-demand` crate):** load the feed account, verify the update is recent,
and read the result (value + std-dev/confidence). Apply the **same four checks** as Pyth: staleness
(max age), expected feed/account, confidence/variance bound, and correct scaling.

---

## Symptom → cause → fix

| Symptom | Root cause | Fix |
|---|---|---|
| "Price update not found" / account doesn't exist | You read without **posting** an update first (pull model) | Bundle the post-update instructions before your instruction in the same tx |
| Price is **stale** / `PriceTooOld` / unexpected value from a past slot | Read with no staleness bound, or update posted in a different (earlier) tx | Use `get_price_no_older_than(max_age, …)`; post + read in **one** tx |
| Price is **zero** or wildly wrong | Ignored the **exponent**, or read the wrong field | `price * 10^exponent`; read the correct mantissa/exponent |
| Works for one symbol, wrong data for another | **Feed id / account not asserted** — wrong feed's update accepted | Pass and check the expected `feed_id` / feed pubkey |
| Occasional garbage during volatility | **Confidence interval** not checked | Reject when `conf`/variance is too wide vs the price |
| CU blowups / tx too large with oracle posts | Posting many feeds inline | Post only the feeds you need; consider ALTs (`transactions.md#alt`); reuse cranked feeds where available |

---

## Diagnostic checklist for any "my oracle integration is broken"

1. Is an **update posted in the same transaction** as the read? (Pull model — the #1 mistake.)
2. Is the read **staleness-bounded**? (`max_age`, not unbounded.)
3. Is the **feed id / account asserted** against the one you expect?
4. Is the **confidence/variance** checked and the **exponent** applied?
5. Are you on the **right cluster** with a feed that actually publishes there (devnet feed ids ≠
   mainnet)?

---

### When to escalate
- Posting updates makes the tx too large / too expensive → `transactions.md` (ALTs, CU sizing).
- You need price *history*/TWAP or an indexed feed → that's an indexer/provider concern, not this
  on-chain consume path.
