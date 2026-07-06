#!/usr/bin/env bash
set -euo pipefail

: "${AUTODUCKS_AGENT:?AUTODUCKS_AGENT env var required}"

# Honor AUTODUCKS_ROOT (set by the decoupled CI path, where the work tree is a
# clean feature branch with no .autoducks/); fall back to the CWD-relative dir
# for the normal single-branch case. Mirrors load-config.sh's resolution.
_root="${AUTODUCKS_ROOT:-.autoducks}"
_cfg="$_root/agents/${AUTODUCKS_AGENT}/defaults.json"
_global="$_root/autoducks.json"
_model=$(jq -r '.model // empty' "$_cfg" 2>/dev/null || jq -r '.defaults.model // empty' "$_global")
_reasoning=$(jq -r '.reasoning // empty' "$_cfg" 2>/dev/null || jq -r '.defaults.reasoning // empty' "$_global")
echo "model=${_model:-claude-sonnet-4-6}"
echo "reasoning=${_reasoning:-high}"
