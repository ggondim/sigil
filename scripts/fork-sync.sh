#!/usr/bin/env bash
# =============================================================================
# fork-sync.sh — forward integration do upstream no fork ggondim/sigil
# =============================================================================
# Mantém o fork sincronizado com o upstream (ver CLAUDE.md / PENDING.md):
#   (b) avança `master` (espelho puro) até `upstream/master` (fast-forward);
#       depois testa, para cada frente (ggondim + feat/fix/docs/*), se ela
#       rebaseia LIMPO sobre o novo master — e sinaliza conflitos.
#
# NÃO dispara agentes sozinho. Em conflito, abre/atualiza UMA issue de tracking
# no fork; o disparo do autoducks é decisão do usuário (comentar na issue).
#
# ENV:
#   FORK       repo do fork            (default ggondim/sigil)
#   UPSTREAM   repo upstream           (default Anmol-Srv/sigil)
#   MODE       report | apply          (default report)
#   SIGIL_ENV  local | ci              (default local)
#   GH_TOKEN   token c/ escopo no fork (obrigatório p/ push/gh)
#
#   report → avança master (ff) + detecta conflitos + relatório/issue. Sem reescrever feats/ggondim.
#   apply  → além do report, rebaseia as feats limpas e reconstrói a ggondim (force-with-lease).
# =============================================================================
set -euo pipefail

FORK="${FORK:-ggondim/sigil}"
UPSTREAM="${UPSTREAM:-Anmol-Srv/sigil}"
MODE="${MODE:-report}"
SIGIL_ENV="${SIGIL_ENV:-local}"
: "${GH_TOKEN:?defina GH_TOKEN (local: export GH_TOKEN=\$(gh auth token))}"
export GH_TOKEN

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log()  { echo "  $*"; }
head1() { echo; echo "=== $* ==="; }

head1 "clone $FORK + fetch upstream"
git clone --quiet "https://x-access-token:${GH_TOKEN}@github.com/${FORK}.git" "$WORK/fork"
cd "$WORK/fork"
git remote add upstream "https://github.com/${UPSTREAM}.git"
git fetch --quiet upstream
git fetch --quiet origin

BASE="$(git rev-parse origin/master)"     # espelho atual
UP="$(git rev-parse upstream/master)"      # ponta do upstream

# ---------------------------------------------------------------------------
# 1) Novidades do mantenedor desde o último sync (o próprio espelho é o marcador)
# ---------------------------------------------------------------------------
head1 "commits novos no upstream (master..upstream/master)"
NEW_COMMITS="$(git log --oneline --no-merges "$BASE..$UP" || true)"
if [ -n "$NEW_COMMITS" ]; then echo "$NEW_COMMITS" | sed 's/^/  /'; else log "(nenhum — espelho já atualizado)"; fi

OPEN_PRS="$(gh pr list -R "$UPSTREAM" --state open --limit 50 --json number,title,headRefName --jq '.[] | "  #\(.number) \(.headRefName) — \(.title)"' 2>/dev/null || true)"

# ---------------------------------------------------------------------------
# 2) Avançar o espelho: master --ff--> upstream/master
# ---------------------------------------------------------------------------
head1 "avançar espelho (master → upstream/master)"
if [ "$BASE" = "$UP" ]; then
  log "master já == upstream/master ($(git rev-parse --short "$UP"))"
elif git merge-base --is-ancestor "$BASE" "$UP"; then
  git push --quiet origin "$UP:refs/heads/master"
  log "master avançado $(git rev-parse --short "$BASE") → $(git rev-parse --short "$UP") (ff)"
else
  log "⚠️ master DIVERGIU do upstream (não é fast-forward) — alguém commitou em master? Atenção manual."
fi

# ---------------------------------------------------------------------------
# 3) Testar rebase de cada frente sobre o novo master (dry-run, não-destrutivo)
# ---------------------------------------------------------------------------
head1 "detectar conflitos (rebase --onto $(git rev-parse --short "$UP") por frente)"
BRANCHES="$(git for-each-ref --format='%(refname:short)' refs/remotes/origin \
  | sed 's#^origin/##' \
  | grep -E '^(ggondim|feat/|fix/|docs/)' || true)"

CLEAN=(); CONFLICT=(); REPORT_ROWS=""
for b in $BRANCHES; do
  git checkout --quiet -B "_t_$b" "origin/$b"
  mb="$(git merge-base "origin/$b" "$UP")"
  if git rebase --quiet --onto "$UP" "$mb" "_t_$b" >/dev/null 2>&1; then
    CLEAN+=("$b"); REPORT_ROWS+="| \`$b\` | ✅ limpo | |"$'\n'
    if [ "$MODE" = "apply" ]; then
      git push --quiet --force-with-lease "origin" "_t_$b:$b" && log "apply: $b rebaseada e empurrada"
    fi
  else
    files="$(git diff --name-only --diff-filter=U 2>/dev/null | paste -sd', ' - || true)"
    git rebase --abort >/dev/null 2>&1 || true
    CONFLICT+=("$b"); REPORT_ROWS+="| \`$b\` | ❌ conflito | ${files:-—} |"$'\n'
    log "CONFLITO: $b  [${files:-?}]"
  fi
  git checkout --quiet --detach
  git branch -D "_t_$b" >/dev/null 2>&1 || true
done

# ---------------------------------------------------------------------------
# 4) Relatório (step summary no CI) + issue de tracking se houver conflito
# ---------------------------------------------------------------------------
REPORT="## 🔄 fork-sync — $(git rev-parse --short "$BASE")→$(git rev-parse --short "$UP")

**Novos commits do upstream:**
$( [ -n "$NEW_COMMITS" ] && echo "$NEW_COMMITS" | sed 's/^/- /' || echo '- (nenhum)' )

**PRs abertos no upstream:**
$( [ -n "$OPEN_PRS" ] && echo "$OPEN_PRS" | sed 's/^  /- /' || echo '- (nenhum)' )

**Rebase de cada frente sobre o novo master:**

| frente | status | arquivos em conflito |
|---|---|---|
${REPORT_ROWS}
Modo: \`$MODE\` · limpas: ${#CLEAN[@]} · conflitos: ${#CONFLICT[@]}"

if [ "$SIGIL_ENV" = "ci" ] && [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "$REPORT" >> "$GITHUB_STEP_SUMMARY"
else
  echo; echo "$REPORT"
fi

if [ "${#CONFLICT[@]}" -gt 0 ]; then
  head1 "abrir/atualizar issue de tracking no fork"
  TITLE_MARK="[upstream-sync]"
  body="$REPORT

---
_Gerado por \`fork-sync.sh\`. Para reconciliar uma frente, comente o disparo do autoducks
(\`/agents execute\`) — os agentes NÃO rodam sozinhos._"
  existing="$(gh issue list -R "$FORK" --state open --search "in:title \"$TITLE_MARK\"" --json number --jq '.[0].number // empty' 2>/dev/null || true)"
  if [ -n "$existing" ]; then
    gh issue edit "$existing" -R "$FORK" --body "$body" >/dev/null && log "issue #$existing atualizada"
  else
    gh issue create -R "$FORK" --title "$TITLE_MARK conflitos de forward-integration" --body "$body" >/dev/null && log "issue criada"
  fi
else
  head1 "sem conflitos — nada a sinalizar"
fi

log "fim (modo $MODE)."
