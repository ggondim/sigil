# Product

## Register

product

## Users

Developers and engineers who use AI coding agents (Claude Code, Codex CLI, Cursor, Kiro, or any MCP-compatible client). Primary context is first-run setup: the user opens the dashboard once to connect their Postgres database, configure an LLM and embedding provider, and wire Sigil into every agent on their machine. After that the dashboard recedes into the background — used occasionally to check memory health, inspect stored facts, or diagnose retrieval problems.

Secondary users: returning developers investigating a specific issue (wrong fact surfaced, hook not firing, search quality degraded).

Job-to-be-done: get Sigil wired and verified in one sitting. Confidence that memory is working, not a second session to figure it out.

## Product Purpose

Sigil is local-first memory infrastructure for AI coding agents. It stores facts, decisions, and context in the user's own Postgres database and injects the most relevant ones into every agent prompt automatically. One shared brain across Claude Code, Codex CLI, Cursor, Kiro, and any MCP-spec client — no cloud account, no vendor lock-in.

The dashboard is the control plane: setup wizard, health monitoring, knowledge base inspection, and retrieval debugging. Success looks like: zero config after first-run, no surprises, clear signal when something is broken.

## Brand Personality

Precise, minimal, authoritative. The interface is a serious infrastructure tool, not a productivity app or SaaS platform. No decoration for its own sake. Every element earns its place. Confidence through restraint.

## Anti-references

- **Not Linear or Notion**: avoid rounded corners, friendly whitespace, pastel accents, and the "productivity app" warmth. Sigil is a utility, not a workspace.
- **Not shadcn/Vercel dark**: avoid the polished-neutral, everything-is-a-card aesthetic that reads as "platform product" — Sigil is closer to a serious developer tool than a SaaS dashboard.
- **Not terminal-raw**: not a CLI dump or tmux pane. Structure is appropriate; the goal is density without noise, not rawness for its own sake.

## Design Principles

1. **Clarity earns trust.** The user needs to know Sigil is working at a glance. Status, errors, and health signals must be unambiguous — no hidden states, no soft failures.
2. **The first run is the critical run.** The setup wizard is where most users form their lasting impression. It must be the most polished surface in the product.
3. **Density without noise.** Developer tools need information density, not visual simplicity. Show the data; eliminate chrome that doesn't carry information.
4. **Local-first is the brand.** The fact that nothing leaves the machine is not a footnote — it shapes how the interface should feel: direct, owned, ungated.
5. **Sharp edges, earned.** The sharp-corner aesthetic is a deliberate choice that signals precision and infrastructure, not an absence of design investment.

## Accessibility & Inclusion

WCAG AA. Adequate contrast on all text (≥4.5:1 body, ≥3:1 large text), full keyboard navigation, screen-reader semantics on interactive controls, reduced-motion alternative for every animation.
