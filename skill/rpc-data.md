# RPC & data-fetching errors

The program is fine; **reading** chain data is failing or timing out. The two perennial issues:
`getProgramAccounts` scans, and public-RPC rate limits.

---

## <a id="gpa"></a>`getProgramAccounts` slow / times out / 504

**Cause:** unfiltered `getProgramAccounts` (gPA) scans **every account your program owns** and
returns full account data. It has no native pagination and gets slower as the program grows — the
classic "worked in dev, dies in prod."

**Fixes (cheapest first):**
1. **Filter server-side** so the RPC returns far less:
   ```ts
   conn.getProgramAccounts(programId, {
     filters: [
       { dataSize: 165 },                                   // exact account size
       { memcmp: { offset: 8, bytes: owner.toBase58() } },  // match a field (offset past 8-byte discriminator)
     ],
     dataSlice: { offset: 0, length: 0 },                   // return keys only if you just need addresses
   });
   ```
   `memcmp` offsets are **after** Anchor's 8-byte discriminator — add 8 to your struct field offset.
2. **Paginate with `getProgramAccountsV2`** (cursor-based, `changedSinceSlot`, 1–10,000/page,
   2–10× faster; programs auto-index after the first call) where your RPC supports it.
   **VERIFY:** not every provider exposes V2 yet — confirm with your RPC (Helius does).
3. **For tokens/NFTs, don't gPA at all — use the DAS API** (`getAssetsByOwner`, `searchAssets`,
   now fungible-aware) or `getTokenAccountsByOwner` for a single owner. gPA over the token program
   is the wrong tool and will be throttled.

---

## <a id="rate-limits"></a>429 / "Too Many Requests" / rate limits

**Cause:** the public endpoint (`api.mainnet-beta.solana.com` / `api.devnet.solana.com`) is
heavily shared and throttles after a modest burst. This also breaks **program deploys**
("N transactions not confirmed, retrying") — a deploy is many txs.

**Fixes:**
- Use a **dedicated RPC** (any provider's free tier beats the public endpoint). For deploy:
  `solana config set --url "https://<dedicated>"`. The deploy **resumes from its buffer** on
  retry — you don't pay twice.
- **Batch** reads (`getMultipleAccounts` instead of N×`getAccountInfo`).
- **Back off** on 429 (respect `Retry-After`); don't hammer in a tight loop.
- **Stop hot-polling.** Subscribe via WebSocket (`onAccountChange`, `onLogs`) or use webhooks
  instead of polling `getSignatureStatuses`/`getAccountInfo` every few hundred ms. Aggressive
  polling is the #1 self-inflicted rate-limit (and egress) cause.

---

## <a id="parsing"></a>"I can't read my data" — parsing logs, txs, and accounts

- **Decode account data with your IDL**, not by hand: an Anchor client
  (`program.account.<name>.fetch(pubkey)`) deserializes the 8-byte discriminator + fields for you.
  Hand-rolled borsh offsets drift the moment the struct changes.
- **Parse instructions/events from a tx** with `getParsedTransaction` + the program's IDL/event
  parser; raw `getTransaction` returns base64 you'd have to decode yourself.
- **Historical/aggregate reads** (all NFTs, holders, tx history) are an **indexer** job, not a
  single RPC call — use DAS / an indexing provider rather than trying to gPA or page `getSignaturesForAddress`
  over huge ranges.

---

### When to escalate
- The read succeeds but the *values* are wrong → likely a layout/discriminator issue,
  `program-anchor.md#discriminator`.
- Browser-side `fetch` failures / CORS / `Buffer` errors → `frontend-wallet.md`.
- Deep indexing/webhook/DAS pipelines → Helius `core-ai` (`das.md`, `webhooks.md`).
