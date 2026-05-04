/**
 * Scope document.source_path uniqueness to (source_path, namespace).
 *
 * Prior schema enforced UNIQUE(source_path) globally — meaning the same file
 * path could only exist in ONE namespace at a time. This bit eval harnesses
 * (per-question namespaces re-using the same source path), and would bite
 * legitimate users wanting the same doc in personal + work namespaces.
 *
 * The composite UNIQUE(source_path, namespace) keeps "no dupes within a
 * namespace" guarantee but allows the same path in different namespaces.
 */

exports.up = async function (knex) {
  // Count any cross-namespace would-be-duplicates the old constraint masked.
  const dupes = await knex.raw(`
    SELECT source_path, COUNT(DISTINCT namespace) AS namespaces
    FROM document
    GROUP BY source_path
    HAVING COUNT(DISTINCT namespace) > 1
  `);
  if (dupes.rows && dupes.rows.length) {
    console.warn(`[migration] ${dupes.rows.length} source_paths now allowed in multiple namespaces.`);
  }

  await knex.schema.alterTable('document', (table) => {
    table.dropUnique('source_path');
  });

  await knex.schema.alterTable('document', (table) => {
    table.unique(['source_path', 'namespace']);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('document', (table) => {
    table.dropUnique(['source_path', 'namespace']);
  });

  // Recreate the old global constraint. If multiple rows share a source_path
  // across namespaces, this DOWN will fail loudly — that's correct, the
  // operator must consolidate first.
  await knex.schema.alterTable('document', (table) => {
    table.unique('source_path');
  });
};
