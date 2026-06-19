# Build & toolchain errors

These fail **before** your program runs — `anchor build` / `cargo build-sbf` / `solana program
deploy`. They are the most demoralizing for newcomers because they feel unrelated to the code
you wrote, and the error text points deep into transitive dependencies.

## The one mental model that explains most of them

There are **three toolchain zones**, and you must land in the middle:

- **Too old** (e.g. pinning Solana **1.18.x** → SBF Rust 1.75): can't compile modern transitive
  crates (`zeroize_derive`, `block-buffer 0.12`, `ahash`, `toml_datetime`) → an **`edition2024`
  cascade you cannot pin your way out of.** Pinning to an old Solana to *force* an old sBPF
  backfires here.
- **Too new / bleeding-edge** (e.g. some web playgrounds, or a brand-new local default): emits an
  **sBPF VM version ahead of what the cluster enables** → `sbpf_version … not enabled` at deploy.
- **Just right = the latest OFFICIAL stable** (`release.anza.xyz/stable`): its Rust is new enough
  to compile every dependency, and its sBPF is what mainnet/devnet accept. Decouple the two:
  **build with the latest toolchain, target the cluster's sBPF with `--arch`.**

---

## <a id="lockfile-v4"></a>`lock file version 4 requires -Znext-lockfile-bump`

**Cause:** your system Cargo (Rust ≥ 1.83 defaults to lockfile **v4**) wrote `Cargo.lock` in v4,
but the Cargo bundled inside `cargo-build-sbf` (older platform-tools Rust) only parses **v3**.

**One-off fix:**
```bash
sed -i 's/^version = 4/version = 3/' Cargo.lock   # v3/v4 carry identical data; only the header differs
```
**Durable fix** (it regenerates v4 every build otherwise, because `cargo metadata` runs with the
system Cargo): make the system toolchain write v3, or keep platform-tools current so both agree.
On older setups: `rustup toolchain install 1.79.0 && rustup default 1.79.0` (v4 became default in
Rust 1.83). On a current Anchor/Agave, prefer upgrading platform-tools so the gap disappears.

---

## <a id="edition2024"></a>`feature edition2024 is required`

**Cause:** a fresh resolve pulled a transitive crate that needs Rust **1.85** (`edition2024`),
but the SBF compiler's Rust is older. You'll see it on `zeroize_derive`, `block-buffer`,
`toml_datetime`, `ahash`, etc.

**Do NOT whack-a-mole pin them one by one** — each pin just lets the resolver grab the next
edition2024 crate, and there are sub-traps (e.g. pinning `zeroize` to 1.7.0 breaks because
`curve25519-dalek 3.2.1` needs `<1.4`; `zeroize_derive 1.3.0` is **yanked** → use 1.4.2).

**Right fixes, in order of preference:**
1. **Use the latest official stable toolchain** so the SBF Rust is new enough to compile
   edition2024. This dissolves the whole class:
   ```bash
   sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
   ```
2. If you must stay on an older platform-tools, kill the class with the **MSRV-aware resolver**
   instead of manual pins. Declare the ceiling and let Cargo downgrade every dep that needs a
   newer Rust in one resolve. **Do NOT put `resolver = "3"` in the manifest** (the SBF toolchain's
   old Cargo also parses the manifest and rejects it) — use a config file the old Cargo ignores:
   ```toml
   # Cargo.toml
   [package]
   rust-version = "1.75.0"
   ```
   ```toml
   # .cargo/config.toml
   [resolver]
   incompatible-rust-versions = "fallback"
   ```
   Then resolve with a **system Cargo ≥ 1.84**, pin the lock to v3, and build **online with
   `--locked`** (not `--offline` — the SBF build still fetches host crates; `--locked` freezes the
   resolution):
   ```bash
   rustup default stable
   rm -f Cargo.lock && cargo generate-lockfile
   sed -i 's/^version = 4/version = 3/' Cargo.lock
   cargo build-sbf -- --locked
   ```
   Two-toolchain rule: **Cargo ≥ 1.84 to resolve, platform-tools to compile.**

---

## <a id="sbpf"></a>`Detected sbpf_version required by the executable which are not enabled`

**Cause (at deploy):** the build emitted an sBPF VM version newer than the target cluster has
enabled. Happens with bleeding-edge toolchains whose **default sBPF runs ahead of the cluster.**

**WRONG fix:** downgrade everything to an old Solana for sBPFv1 — that drops you into the
`edition2024` cascade above.

**RIGHT fix (build new, target old):** keep the latest toolchain so deps compile, but force the
emitted sBPF down to a version the cluster enables:
```bash
# --arch values are v1 / v2 / v3 ... Pick the HIGHEST the cluster enables (NOT the toolchain
# default, which may be higher than the cluster supports). On devnet, --arch v3 has been accepted
# where the default was rejected. Check options: cargo build-sbf --help | grep -i arch
cargo build-sbf --arch v3
```
**Reclaim stranded SOL first:** a failed deploy leaves a buffer account holding your lamports
(the CLI prints its address). Recover before retrying: `solana program close --buffers`.

---

## <a id="program-id"></a>`DeclaredProgramIdMismatch` (4100) — run `anchor keys sync`

**Cause:** `declare_id!("…")` in your program ≠ the keypair in `target/deploy/<name>-keypair.json`.
Common after cloning a repo or regenerating keys.

**Fix:**
```bash
anchor keys sync   # rewrites declare_id! and Anchor.toml to match the deploy keypair
anchor build       # rebuild so the new id is baked in
```
Anchor 0.32 uploads the IDL on every `anchor deploy` by default — use `anchor deploy --no-idl`
to opt out if that surprises you.

---

## <a id="workspace"></a>"current package believes it's in a workspace when it's not"

**Cause:** a standalone crate living inside a repo that already has a root workspace `Cargo.toml`.

**Fix:** add an empty workspace table to the crate's own `Cargo.toml` so it stands alone:
```toml
[workspace]
```

---

## <a id="version-matrix"></a>Anchor ↔ Agave ↔ rustc version skew

Symptoms: `package … requires rustc 1.6x`, `proc_macro2 … source_file not found`,
`unexpected cfg condition value: solana`, `winnow requires rustc …`, `build_hasher` unstable
feature. All are the same disease — mismatched toolchains.

**Fix:** align to a **known-good matrix** rather than chasing individual crates.
- Use a recent **Anchor 0.31.1+ / 0.32** with a matching **Agave** release.
- Pin via `[toolchain]` in `Anchor.toml` (Anchor reads `anchor_version`/`solana_version`).
- Keep `@coral-xyz/anchor` (client) on the **same minor** as the on-chain `anchor-lang`.
- When in doubt, install the latest official stable Agave + the Anchor that its release notes
  pair with, and regenerate `Cargo.lock`.

> **VERIFY (drift-prone):** exact platform-tools Rust version and the highest cluster-enabled
> sBPF `--arch` move over time. Check `solana --version`, `cargo-build-sbf --version`, and the
> current Agave release notes before relying on a specific number.

---

## Deploy cost & rent surprises

- **"Deploy wants 5–7 SOL and I only have 2."** Upgradeable deploys reserve **2× the program
  size** for future upgrades, and Anchor binaries have a size floor. Options: size-optimize
  (`[profile.release] opt-level="z", lto=true, codegen-units=1, strip=true`); deploy
  **non-upgradeable** with `solana program deploy --final` (halves it); or write the program
  **native** (much smaller) when every SOL counts.
- **"SOL got refunded after deploy"** — that's rent mechanics returning the unused buffer; normal.
- **RPC drops chunks during deploy** ("N transactions not confirmed, retrying") — a deploy is
  many txs; the public endpoint rate-limits. Use a dedicated RPC; the deploy **resumes from the
  buffer**, you don't pay twice. See `rpc-data.md`.

---

### Minimal known-good recipe (native or Anchor, devnet)
```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"   # latest official stable
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
# (standalone native crate: add empty [workspace] to its Cargo.toml)
sed -i 's/^version = 4/version = 3/' Cargo.lock 2>/dev/null || true
cargo build-sbf --arch v3            # build new, target the cluster's sBPF
solana config set --url "https://<dedicated-devnet-rpc>"
solana program deploy target/deploy/<name>.so
```
