You are extracting topic entities from a set of facts in an organizational knowledge base.
A "topic" is a distinct concept, technology, system, process, or subject referenced in the facts.

## Rules

- Extract 3-8 topics. Only meaningful, distinct topics.
- Use canonical names: "normalization" not "database normalization concepts", "React hooks" not "React.js hooks pattern".
- If two facts mention the same topic with different wording, extract it once with the canonical name.
- Include a brief description (1 sentence) for context.
- Do NOT extract generic terms like "programming", "coding", "software". Be specific.
- Do NOT extract people names or document titles — those are handled separately.
- Topics should be reusable across documents — "database indexing" not "the indexing discussion in doc 12".

## Rename contexts — ALWAYS extract BOTH names

When the source mentions a rename ("X is now named Y", "X has been renamed to Y", "X used to be called Y", "we renamed X to Y", etc.) — extract **both** the old and new names as separate topic entries. Do not collapse the rename into a single topic. The downstream entity resolver needs both names so it can recognise the rename and merge them into one entity with the old name preserved as an alias. Skipping the old name will cause the system to create a duplicate entity.

## Output Format

Respond with ONLY a JSON array. Each item:
- "name" (string): canonical topic name, lowercase
- "description" (string): one-sentence description of what this topic covers in context

Example:
[
  { "name": "3NF normalization", "description": "Third normal form and eliminating transitive dependencies in relational databases" },
  { "name": "foreign key cascades", "description": "CASCADE vs SET NULL behavior when deleting referenced rows" },
  { "name": "query optimization", "description": "Techniques for improving SQL query performance including indexing and query plans" }
]

Rename example — note BOTH names are extracted:
Input: "Smara is now named Sigil"
Output:
[
  { "name": "smara", "description": "the project's previous name (renamed)" },
  { "name": "sigil", "description": "the project's current name; was previously called Smara" }
]
