# sigil — fork ggondim/sigil (instruções do projeto)

Fork de `Anmol-Srv/sigil` para desenvolver features/ajustes, com automação de agentes
(autoducks) e sincronização com o upstream. O setup vive na branch `ggondim` e **nunca** é
enviado ao upstream (as `feat/*` que viram PR upstream saem de `master`, limpas).

## Objetivo

- Esse repositório é um **fork privado** do upstream, com **setup próprio** (workflows, skills, etc.) e
  **branches de features** (`feat/*`) que podem virar PR upstream.

- A ideia é que o upstream continue **limpo**, sem o setup do fork, e que o fork seja **sempre
  sincronizado** com o upstream (via workflow `fork-sync`). Esse workflow: 1) lista novos commits/PRs do
  maintainer no upstream; 2) busca conflitos entre a branch `ggondim` ou os PRs do fork e os novos commits;
  3) dispara os agentes do autoducks conforme solicitado por mim para alinhar os dois repositórios.

- A branch `ggondim` é a **branch de integração** do fork, onde o setup e as features são integradas
  e testadas. As branches `feat/*` são **branches de desenvolvimento** que saem de `master` (upstream
  puro) e podem virar PR upstream, de acordo com a decisão do desenvolvedor.

- Cada feature gera issues no fork (ver **Política de issues**): issues de *trabalho* efêmeras para
  operar os agentes, e uma issue de *documentação* (`changelog`) obrigatória, aberta automaticamente
  quando o PR da feature é mergeado na `ggondim`. O PR pro upstream é opcional (minha decisão) e é
  linkado manualmente nessa issue de documentação.

**Corolário operacional:** cada `feat/*` fica **viva** como fonte de PR upstream — estar integrada
na `ggondim` (build privado) **nunca** é motivo para deletá-la.

## Política de issues

Dois tipos de issue coexistem no fork, com papéis distintos:

**1 — Issues de trabalho** (eu crio, para operar os agentes do autoducks)
- Rascunhos, planos, subtasks e a issue de *feature* que casa 1:1 com uma branch.
- **Efêmeras:** quando a branch é fechada, a issue é fechada junto.
- **Não** são a "issue obrigatória por feature" — são insumo de orquestração.

**2 — Issues de documentação** (`changelog`, criadas automaticamente)
- Um workflow customizado (**a construir**) abre uma issue no **merge de um PR de _feature_ na
  `ggondim`** — só PRs de feature disparam (os PRs de _task_ do autoducks miram a feature branch,
  não a `ggondim`).
- Documenta o trabalho feito e referencia o PR do fork. Se houve PR pro upstream, **eu linko
  manualmente** — o workflow não descobre isso sozinho.
- Fica **aberta** como tracker do PR upstream (sem necessidade de acompanhamento ativo).
- É a "issue obrigatória descrevendo o trabalho" que este documento exige. Label: `changelog`.

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

## Sincronização com upstream — `fork-sync` (agendado)

`.github/workflows/fork-sync.yml` (cron + dispatch): fast-forward de `master` pro
`upstream/master`, testa rebase de cada frente (`ggondim` + `feat/*`) sobre o novo master, e em
conflito abre/atualiza a issue `[upstream-sync]`. `mode=report` (default) só sinaliza; `apply`
rebaseia as limpas. Roda com o `GITHUB_TOKEN` (sem PAT).

## Autoducks — corte e integração

O autoducks separa **ponto de corte** e **alvo do PR** via
[.autoducks/autoducks.json](.autoducks/autoducks.json): `base_branch: master` (de onde as
`feature/*` são cortadas) e `integration_branch: ggondim` (para onde o PR final da feature é
aberto). Assim cada `feature/*` nasce limpa (`master` + só o trabalho da feature), pronta para
virar PR upstream, e é integrada na `ggondim` sem reintroduzir empilhamento.

Como a `master` é espelho limpo (sem `.autoducks/`), o `autoducks-execute` carrega a tooling da
`ggondim` para um diretório **fora** da work tree (via `AUTODUCKS_ROOT`) — ela nunca é commitada
na feature/task branch. A action do LLM é resolvida por
`ggondim/sigil/.autoducks/providers/llm/claude@ggondim`, independente da branch em trabalho.

> A default branch do repo no GitHub é `ggondim`: triggers `issue_comment` do autoducks rodam a
> partir da default branch, e os workflows do fork vivem só na `ggondim`.
