/**
 * Add `source_metadata` jsonb and `connection_id` FK to `document`.
 *
 * Why: the ingestion pipeline accepts a `metadata` arg (from sources/file.js,
 * sources/url.js, future connectors) but currently drops it on the floor —
 * it reaches `parse()` for format hints and `linkDocumentEntities()` for
 * minor signals, but never lands on the document row. That made source-
 * instance reasoning ("this came from Slack message ts=X in team=Y")
 * impossible.
 *
 * Pods need this to attach connector-sourced documents to the right
 * workspace pod and to derive person pods from senders.
 *
 * Defaults to '{}' so all existing rows have a sensible empty value.
 */

exports.up = async function (knex) {
  await knex.schema.alterTable('document', (table) => {
    table.integer('connection_id').references('id').inTable('connection');
    table.jsonb('source_metadata').notNullable().defaultTo('{}');
  });

  await knex.raw('CREATE INDEX document_connection_id_idx ON document (connection_id)');
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS document_connection_id_idx');
  await knex.schema.alterTable('document', (table) => {
    table.dropColumn('source_metadata');
    table.dropColumn('connection_id');
  });
};
