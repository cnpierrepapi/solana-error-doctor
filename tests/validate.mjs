#!/usr/bin/env node
// Structural test suite for the Solana Error Doctor.
// Verifies the skill is internally consistent so routing never dead-ends:
//   - SKILL.md, all chapters, errors-index.json, commands, agent, installer exist
//   - errors-index.json is valid JSON and every `chapter` points to a real file + anchor
//   - every chapter referenced by SKILL.md exists
//   - each command file has YAML frontmatter with a description
//   - no AI-assistant attribution leaked into the repo
// Exit non-zero on any failure. No network, no side effects.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = [];
const pass = [];
const ok = (c, m) => (c ? pass : fail).push(m);
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// 1) required files
const required = [
  "skill/SKILL.md", "skill/errors-index.json", "skill/resources.md",
  "commands/solana-debug.md", "commands/diagnose-tx.md", "commands/fix-build.md",
  "commands/preflight.md", "agents/solana-debugger.md", "install.sh", "README.md", "LICENSE",
];
for (const f of required) ok(existsSync(join(ROOT, f)), `exists: ${f}`);

// 2) chapters referenced by SKILL.md routing table all exist
const skill = read("skill/SKILL.md");
const chapterRefs = [...skill.matchAll(/`([a-z-]+\.md)`/g)].map((m) => m[1]);
const uniqueChapters = [...new Set(chapterRefs)];
ok(uniqueChapters.length >= 8, `SKILL.md routes to ${uniqueChapters.length} chapters (>=8)`);
for (const ch of uniqueChapters) ok(existsSync(join(ROOT, "skill", ch)), `routed chapter exists: ${ch}`);

// 3) errors-index.json valid + every chapter target (file#anchor) resolves
let index;
try {
  index = JSON.parse(read("skill/errors-index.json"));
  ok(true, "errors-index.json parses");
} catch (e) {
  ok(false, `errors-index.json parses (${e.message})`);
}
if (index) {
  ok(Array.isArray(index.entries) && index.entries.length >= 20,
    `errors-index has ${index.entries?.length ?? 0} entries (>=20)`);
  for (const e of index.entries ?? []) {
    const [file, anchor] = e.chapter.split("#");
    const exists = existsSync(join(ROOT, "skill", file));
    ok(exists, `index '${e.id}' → chapter file ${file}`);
    if (exists && anchor) {
      const body = read(`skill/${file}`);
      ok(body.includes(`id="${anchor}"`) || body.includes(`#${anchor}`),
        `index '${e.id}' → anchor #${anchor} present in ${file}`);
    }
    ok(Array.isArray(e.signals) && e.signals.length > 0, `index '${e.id}' has signals`);
  }
}

// 4) command files have frontmatter with a description
for (const c of readdirSync(join(ROOT, "commands"))) {
  const body = read(`commands/${c}`);
  ok(body.startsWith("---"), `command frontmatter: ${c}`);
  ok(/\ndescription:/.test(body.split("---")[1] ?? ""), `command has description: ${c}`);
}

// 5) no AI-assistant AUTHORSHIP attribution anywhere in the tracked text.
//    Allowed: the functional platform target — "Claude Code" / "Codex" (the agents this
//    skill installs into) and the "~/.claude" install path. Banned: anything that reads as
//    "an AI wrote this" (co-authored-by, generated-by, model names, vendor names).
const scanDirs = ["skill", "commands", "agents"];
const banned =
  /(?<![.\w])claude\b(?!\s+code)|anthropic|co-?authored-?by|generated (?:with|by)|claude (?:opus|sonnet|haiku)|\bgpt-?\d|\bopenai\b|copilot/i;
for (const d of scanDirs) {
  for (const f of readdirSync(join(ROOT, d))) {
    const body = read(`${d}/${f}`);
    ok(!banned.test(body), `no authorship attribution: ${d}/${f}`);
  }
}
for (const f of ["README.md", "LICENSE", "install.sh"]) ok(!banned.test(read(f)), `no authorship attribution: ${f}`);

// report
console.log(`\n  ${pass.length} passed`);
if (fail.length) {
  console.error(`  ${fail.length} FAILED:`);
  for (const m of fail) console.error("   ✗ " + m);
  process.exit(1);
}
console.log("  all structural checks passed ✓\n");
