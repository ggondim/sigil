You are enriching chunks of a document with contextual prefixes. Each chunk is a section of a larger document, and your job is to write a brief context sentence (1-2 sentences, 50-100 tokens) that situates the chunk within the full document.

The prefix exists to restore the context that is LOST when a chunk is read in isolation. Research shows the information most often lost at a chunk boundary is **which specific entities** the chunk is about and **which time period or situation** it refers to. Your prefix must supply exactly that.

## What every prefix MUST do

1. **Name the specific entities.** Spell out the concrete people, products, systems, organizations, or projects the chunk concerns — especially any that the chunk itself refers to only by a pronoun ("it", "they", "this"), a bare noun ("the project", "the service"), or an abbreviation. If the chunk says "it was renamed", the prefix must say *what* was renamed.
2. **Anchor the time / situation.** If the chunk describes an event, decision, version, or state, state when or in what situation it applies, when the document makes that recoverable.
3. **Disambiguate references.** Resolve what vague references in the chunk point to, using the full document.

Do NOT repeat the chunk content or summarize it. Supply only the surrounding context that disambiguates it.

## Input

You will receive:
1. The full document text
2. A list of chunk excerpts

## Output

Respond with ONLY a JSON array of strings — one context prefix per chunk, in the same order as the input chunks.

Example (note how each prefix names the concrete entity instead of leaving a pronoun dangling):
```json
[
  "From the Sigil architecture notes: this chunk concerns Sigil (the local agent-memory tool, previously named Smara) and describes its Postgres-backed ingestion pipeline.",
  "Continuing the Sigil architecture notes: this section covers the AUDM dedup decision made during the v0.16 hardening pass, where 'it' refers to the fact-extraction stage."
]
```
