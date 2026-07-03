# sigil — fork ggondim/sigil (instruções do projeto)

Fork de `Anmol-Srv/sigil` para desenvolver features/ajustes, com automação de agentes
(autoducks) e sincronização com o upstream. O setup vive na branch `ggondim` e **nunca** é
enviado ao upstream (as `feat/*` que viram PR upstream saem de `master`, limpas).

## Remotes

- `origin` = fork (`ggondim/sigil`) · `upstream` = `Anmol-Srv/sigil`.
- Se faltar: `git remote add upstream https://github.com/Anmol-Srv/sigil.git`.

## Modelo de branches

| Branch | Papel | Quem move |
|---|---|---|
| **`master`** | Espelho **limpo** do `upstream/master`. Nunca se commita aqui. | só o job `fork-sync` (ff pro upstream). |
| **`ggondim`** (default) | **Integração** + setup (`.autoducks/`, workflows, skills). É onde se desenvolve/builda. | você / agentes / `/launch`. |
| **`feat/*` `fix/*` `docs/*`** | **Uma branch por PR/issue**, isolada, ramificada de `master`. | você / agentes. |

**Regra de ouro (anti-empilhamento):** toda `feat/*` sai de `master` (upstream puro), nunca de
outra `feat/*` nem da `ggondim`. A integração acontece só via merges na `ggondim`.

## Fluxo de uma feature

**Via agentes (autoducks):**
- Abra uma **issue** (tipo `Feature` = trabalho grande a decompor; senão vira `Task`).
- Comente **`/agents execute`**: em issue `Feature` → **devise/wave** (quebra em Tasks e roda em
  paralelo); em `Task` → **execute** (implementa e abre PR pra `base_branch` = `ggondim`).
- Outros: `/agents design` (spec a partir de ideia), `/agents devise` (quebra spec em tasks),
  `/agents fix`, `/agents revert`, `/agents close`.

**Manual:** `git checkout master && git checkout -b feat/<slug>` → implementa → **`/launch`**
(gates + merge em `ggondim` + PR opcional pro upstream).

## Sincronização com upstream — `fork-sync` (agendado)

`.github/workflows/fork-sync.yml` (cron + dispatch): fast-forward de `master` pro
`upstream/master`, testa rebase de cada frente (`ggondim` + `feat/*`) sobre o novo master, e em
conflito abre/atualiza a issue `[upstream-sync]`. `mode=report` (default) só sinaliza; `apply`
rebaseia as limpas. Roda com o `GITHUB_TOKEN` (sem PAT).

## Setup / secrets

- Secret necessário: **`CLAUDE_CODE_OAUTH_TOKEN`** (LLM dos agentes). O resto usa o `GITHUB_TOKEN`.
- App: **Claude GitHub App** instalado neste repo (para os agentes).
- Permissões de Actions: read/write + criar PRs (já configurado).
- `.autoducks/autoducks.json`: `base_branch=ggondim`, `model=sonnet`.

> ⚠️ Ressalva conhecida: o autoducks corta a task de `base_branch` (`ggondim`) e PR de volta pra
> ela — o que pode reintroduzir empilhamento. O `fork-sync` rebaseando as `feat/*` sobre `master`
> mantém isso sob controle; a política final está em refino (ver `PENDING.md`, local/gitignored).
