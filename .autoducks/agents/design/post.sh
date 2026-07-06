#!/usr/bin/env bash
set -euo pipefail
export AUTODUCKS_AGENT="design"
source "$(dirname "${BASH_SOURCE[0]}")/../../core/config/load-config.sh"
source "$AUTODUCKS_ROOT/core/feedback/react-to-comment.sh"
source "$AUTODUCKS_ROOT/core/feedback/notify-failure.sh"

# Check if design spec was produced
if [[ ! -f /tmp/design-spec.md ]]; then
  notify_failure "$ISSUE_NUM" "$RUN_ID"
  react_to_comment "$COMMENT_ID" "confused"
  exit 1
fi

# Update issue body with the design spec
its::update_issue_body "$ISSUE_NUM" /tmp/design-spec.md

# Set issue type to Feature
its::set_issue_type "$ISSUE_NUM" "Feature"

# Fork divergence: issue types require an org owner (GitHub inherits repo issue
# types from the org). This fork is user-owned, so set_issue_type is a no-op and
# `github.event.issue.type` stays null. The wave/tactical workflow guards gate on
# the `Feature` LABEL, so apply it explicitly or the loop can't route. Harmless
# (belt) on org repos that also set the type. See CLAUDE.md "Issue types vs label".
its::add_label "$ISSUE_NUM" "Feature" 2>/dev/null || true

# Remove Draft label if present
its::remove_label "$ISSUE_NUM" "Draft" 2>/dev/null || true

react_to_comment "$COMMENT_ID" "+1"

# Notify commenter
its::comment_issue "$ISSUE_NUM" "✅ Design specification complete.

_Ran with \`${MODEL:-unknown}\` at reasoning \`${REASONING:-unknown}\`._

Use \`/agents devise\` to create the tactical plan, or assign @tactical to this issue."
