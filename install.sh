#!/usr/bin/env bash
# Solana Error Doctor — installer
# Copies the skill, commands, and agent into your agent config (Claude Code / Codex) so the
# /solana-debug, /diagnose-tx, /fix-build, and /preflight commands and the
# solana-debugger agent are available. Safe and idempotent: it only writes into
# ~/.claude (or a target you pass) and never deletes anything you didn't install.
#
# Usage:
#   ./install.sh                 # install into ~/.claude
#   ./install.sh /path/to/.claude
#   TARGET=/path/to/.claude ./install.sh
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-${TARGET:-$HOME/.claude}}"

SKILL_NAME="solana-error-doctor"
SKILL_DEST="$TARGET/skills/$SKILL_NAME"
CMD_DEST="$TARGET/commands"
AGENT_DEST="$TARGET/agents"

echo "Solana Error Doctor → installing into: $TARGET"

mkdir -p "$SKILL_DEST" "$CMD_DEST" "$AGENT_DEST"

# 1) skill (SKILL.md + chapters + errors-index.json)
cp -f "$SRC_DIR/skill/"*.md "$SKILL_DEST/"
cp -f "$SRC_DIR/skill/errors-index.json" "$SKILL_DEST/"
echo "  ✓ skill        → $SKILL_DEST"

# 2) commands
for f in solana-debug diagnose-tx fix-build preflight; do
  cp -f "$SRC_DIR/commands/$f.md" "$CMD_DEST/$f.md"
done
echo "  ✓ commands     → $CMD_DEST (/solana-debug, /diagnose-tx, /fix-build, /preflight)"

# 3) agent
cp -f "$SRC_DIR/agents/solana-debugger.md" "$AGENT_DEST/solana-debugger.md"
echo "  ✓ agent        → $AGENT_DEST/solana-debugger.md"

cat <<'EOF'

Installed. Next:
  • Restart your agent (Claude Code / Codex) so it picks up the new commands/agent.
  • Try it:   /solana-debug  A seeds constraint was violated
  • Inspect a tx:  /diagnose-tx <signature>
  • Optional: this skill's /diagnose-tx works best with a Solana RPC MCP (e.g. Helius)
    configured. See .mcp.json.example for a starting point.

Uninstall: remove the three paths printed above.
EOF
