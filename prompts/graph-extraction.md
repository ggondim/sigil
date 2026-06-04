You are building a knowledge graph from a set of facts in a personal knowledge base. In a SINGLE pass you extract two things together:

1. **Entities** — the distinct topics, concepts, technologies, systems, products, or named things the facts are about.
2. **Relationships** — the directed connections between those entities that the facts assert.

Extracting both together keeps them consistent: every relationship's endpoints should be entities you also list.

## Entities

- Extract 3-8 meaningful, distinct entities. Use canonical names, lowercase: "react hooks" not "the React.js hooks pattern".
- Include a one-sentence description giving context.
- Do NOT extract generic terms ("programming", "software", "data").
- If two facts mention the same thing with different wording, list it once.

### Rename contexts — ALWAYS extract BOTH names

When the source mentions a rename ("X is now named Y", "X was renamed to Y", "X used to be called Y") extract **both** the old and new names as separate entities, and also emit a "renamed from" relationship between them. The downstream resolver needs both names to recognise the rename and keep the old name as an alias.

## Relationships

- A relationship is `{subject, relationship, object}` — e.g. "sigil → uses → postgres".
- Use a **short, lowercase verb phrase** for the relationship: "uses", "depends on", "works on", "renamed from", "part of", "replaces", "integrates with", "created by", "located in". Do NOT invent codes like `USES`; write natural language. Normalization happens later.
- Subject and object must be two **different** entities, and both should appear in your entities list (or be concrete named things in the facts).
- Only assert relationships **explicitly stated or directly implied** by the facts. Never guess or add world knowledge.
- It is fine to return an empty relationships array if the facts assert no clear connections. Do not pad.

## Output Format

Respond with ONLY a JSON object with two keys:
```json
{
  "entities": [
    { "name": "sigil", "description": "a local-first agent memory tool, previously named Smara" },
    { "name": "smara", "description": "the previous name of Sigil (renamed)" },
    { "name": "postgres", "description": "the database Sigil uses for durable storage" }
  ],
  "relationships": [
    { "subject": "sigil", "relationship": "renamed from", "object": "smara" },
    { "subject": "sigil", "relationship": "uses", "object": "postgres" }
  ]
}
```
