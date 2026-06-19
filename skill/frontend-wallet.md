# Frontend & wallet errors

Browser-side Solana errors are dominated by **Node polyfills missing in the bundler** and
**wallet providers running during server-side rendering**. The single most-viewed Solana
developer question of all is `Buffer is not defined` — so this chapter pays off fast.

---

## <a id="buffer"></a>`Buffer is not defined` (and `process`/`global` is not defined)

**Cause:** `@solana/web3.js` and `@solana/spl-token` use Node globals (`Buffer`, sometimes
`process`/`global`). Modern browser bundlers (Vite, webpack 5, Next.js) **do not** polyfill these
automatically.

**Fix depends on the bundler:**

**Vite** — provide the polyfill and alias `buffer`:
```ts
// main.tsx (top, before other imports that use Buffer)
import { Buffer } from "buffer";
globalThis.Buffer = Buffer;
```
```ts
// vite.config.ts
export default defineConfig({
  define: { global: "globalThis" },
  resolve: { alias: { buffer: "buffer" } },
  optimizeDeps: { include: ["buffer"] },
});
```
(or use `vite-plugin-node-polyfills`.)

**Next.js (App Router)** — set the global in a **client** component before any web3 call, and
import web3 code only in client components / `dynamic(..., { ssr: false })`:
```ts
"use client";
import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") globalThis.Buffer = Buffer;
```
> This exact shim is what keeps `@solana/spl-token` from throwing in the browser — set it **before**
> the first spl-token/web3 call runs, or you'll still hit the error on the initial render.

**webpack 5** — add `resolve.fallback = { buffer: require.resolve("buffer/") }` and a
`ProvidePlugin({ Buffer: ["buffer", "Buffer"] })`.

Install the package either way: `npm i buffer`.

---

## <a id="bigint"></a>`bigint: Failed to load bindings, pure JS will be used`

**This is a warning, not an error.** `bigint-buffer` (a transitive dep) failed to load an optional
native binding and silently falls back to pure JS. Your app still works.

- **Ignore it**, or silence the noise (`npm i` with build tools present, or filter the log).
- If it appears during a build step and you want it gone, ensure native build tools are available,
  or pin/dedupe `bigint-buffer`. Do **not** spend time "fixing" functionality — there's nothing
  broken.

---

## <a id="ssr"></a>Wallet-adapter + SSR: `window is not defined`, hydration mismatch, `createContext is not a function`

**Cause:** wallet-adapter and many web3 modules assume a browser. Running them during SSR/prerender
throws `window/document is not defined`, and rendering wallet UI on the server then re-rendering on
the client causes **hydration mismatches**.

**Fixes:**
- Mark the providers **client-only**. In Next.js App Router, the file with
  `ConnectionProvider`/`WalletProvider`/`WalletModalProvider` starts with `"use client"`.
- **Dynamically import** the wallet UI with SSR disabled where needed:
  ```ts
  const WalletMultiButton = dynamic(
    () => import("@solana/wallet-adapter-react-ui").then(m => m.WalletMultiButton),
    { ssr: false },
  );
  ```
- Set an **explicit RPC endpoint** in `ConnectionProvider` (don't rely on a default), and import
  the adapter CSS once.
- With Wallet Standard auto-detection you often **don't need** the heavy
  `@solana/wallet-adapter-wallets` package — fewer deps, fewer build issues.

---

## <a id="signing"></a>Partial-signing from the browser; "dApp may be malicious"

- **Partial sign:** build the tx, have other required signers `partialSign` (e.g. an ephemeral
  keypair you control), **then** hand it to the wallet (`signTransaction`/`signAndSendTransaction`)
  — the wallet adds the user's signature and preserves the others. Order matters: add non-wallet
  signatures before the wallet signs.
- **"This dApp may be malicious" / simulation warnings** in Phantom usually mean the wallet's
  **transaction simulation failed or looked risky** (e.g. it would drain SOL, or it errored). Make
  the tx simulate cleanly (correct accounts, priority fee, no unexpected balance changes); a tx
  that fails simulation is what trips the warning.

---

### When to escalate
- The tx reaches the chain but fails there → `transactions.md` or `program-anchor.md`
  (use `/diagnose-tx <sig>`).
- Mobile (React Native / Mobile Wallet Adapter) → `solana-mobile/solana-mobile-dev-skill`.
