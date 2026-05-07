import path from 'node:path';

import { resolveEntity, resolveTopicsFromFacts } from './resolver.js';
import { createRelation } from './relations.js';
import { linkEntitiesToFact } from '../facts/entity-linker.js';
import { PROMPTS_DIR } from '../../lib/paths.js';

const ENTITY_PROMPT = path.join(PROMPTS_DIR, 'entity-extraction.md');

/**
 * Orchestrates entity linking for a document ingestion.
 *
 * Supports two modes:
 *   1. Default — creates document entity, optional author, LLM-extracted topics
 *   2. Custom entities — caller provides explicit entities + relations via `entityDefs`
 *
 * entityDefs format:
 *   {
 *     items: [{ name, type, description? }],
 *     relations: [{ source, target, type }]    // source/target are entity names
 *   }
 */
async function linkDocumentEntities(document, factResults, namespace, entityDefs) {
  const { title, sourceType, metadata = {} } = document;

  const activeFacts = factResults.filter((r) => r.action === 'ADD' || r.action === 'UPDATE');
  const factObjects = activeFacts
    .map((r) => r.fact || r.existing)
    .filter(Boolean);

  const firstFact = activeFacts.find((r) => r.fact)?.fact;
  const firstFactId = firstFact?.id || null;
  const today = new Date().toISOString().split('T')[0];

  // Custom entities mode
  if (entityDefs?.items?.length) {
    return linkCustomEntities({
      entityDefs,
      factObjects,
      firstFactId,
      namespace,
      today,
    });
  }

  // Default mode — document + author + LLM-extracted topics
  return linkDefaultEntities({
    title,
    sourceType,
    metadata,
    factObjects,
    firstFactId,
    namespace,
    today,
  });
}

async function linkCustomEntities({ entityDefs, factObjects, firstFactId, namespace, today }) {
  const resolvedByName = {};
  let relationCount = 0;

  const episodeText = factObjects.map((f) => f.content).filter(Boolean).join('\n');

  // Resolve all declared entities; thread the cohort so each resolveEntity
  // can consider previously-resolved entities as Stage 3 candidates.
  const cohort = [];
  for (const item of entityDefs.items) {
    const entity = await resolveEntity({
      name: item.name,
      entityType: item.type,
      description: item.description,
      namespace,
      episodeText,
      episodeEntityIds: cohort,
    });
    resolvedByName[item.name] = entity;
    if (entity?.id) cohort.push(entity.id);
  }

  // Create declared relations
  for (const rel of entityDefs.relations || []) {
    const source = resolvedByName[rel.source];
    const target = resolvedByName[rel.target];
    if (!source || !target) continue;

    const relFact = findFactMentioning(factObjects, rel.source) || findFactMentioning(factObjects, rel.target);
    await createRelation({
      sourceId: source.id,
      targetId: target.id,
      relationType: rel.type,
      sourceFactId: relFact?.id || firstFactId,
      validAt: today,
    });
    relationCount++;
  }

  // Link facts ↔ entities
  const allEntities = Object.values(resolvedByName);
  let factEntityLinks = 0;

  for (const fact of factObjects) {
    const mentioned = allEntities.filter((e) => factMentionsEntity(fact.content, e));
    if (mentioned.length) {
      await linkEntitiesToFact(fact.id, mentioned);
      factEntityLinks += mentioned.length;
    }
  }

  return {
    entityCount: allEntities.length,
    relationCount,
    factEntityLinks,
    topics: allEntities.filter((e) => e.entityType === 'topic').map((e) => e.name),
  };
}

async function linkDefaultEntities({ title, sourceType, metadata, factObjects, firstFactId, namespace, today }) {
  if (!title) {
    // Thoughts have no title — skip the document entity creation, but
    // still resolve topics AND link them to the underlying facts so that
    // search-time graph traversal can find a thought via its topic
    // entity. (Earlier behaviour returned early without linking, leaving
    // every thought-route fact orphaned in fact_entity. Renames in
    // particular relied on these links being present so that the renamed
    // entity's UUID still points at the historical text.)
    const topics = factObjects.length
      ? await resolveTopicsFromFacts(factObjects, { promptPath: ENTITY_PROMPT, namespace })
      : [];

    let factEntityLinks = 0;
    for (const fact of factObjects) {
      const mentioned = topics.filter((e) => factMentionsEntity(fact.content, e));
      if (mentioned.length) {
        await linkEntitiesToFact(fact.id, mentioned);
        factEntityLinks += mentioned.length;
      }
    }

    return {
      entityCount: topics.length,
      relationCount: 0,
      factEntityLinks,
      topics: topics.map((e) => e.name),
    };
  }

  const docEpisodeText = factObjects.map((f) => f.content).filter(Boolean).join('\n').slice(0, 2000);

  const docEntity = await resolveEntity({
    name: title,
    entityType: 'document',
    description: `${sourceType} document: ${title}`,
    namespace,
    episodeText: docEpisodeText,
  });

  let authorEntity = null;
  if (metadata.author) {
    authorEntity = await resolveEntity({
      name: metadata.author,
      entityType: 'person',
      namespace,
      episodeText: docEpisodeText,
      episodeEntityIds: docEntity?.id ? [docEntity.id] : [],
    });
  }

  const topics = factObjects.length
    ? await resolveTopicsFromFacts(factObjects, { promptPath: ENTITY_PROMPT, namespace })
    : [];

  let relationCount = 0;

  if (authorEntity) {
    await createRelation({
      sourceId: docEntity.id,
      targetId: authorEntity.id,
      relationType: 'AUTHORED_BY',
      sourceFactId: firstFactId,
      validAt: today,
    });
    relationCount++;
  }

  for (const topic of topics) {
    const topicFact = findFactMentioning(factObjects, topic.name);
    await createRelation({
      sourceId: docEntity.id,
      targetId: topic.id,
      relationType: 'COVERS',
      sourceFactId: topicFact?.id || firstFactId,
      validAt: today,
    });
    relationCount++;
  }

  const allEntities = [docEntity, authorEntity, ...topics].filter(Boolean);
  let factEntityLinks = 0;

  for (const fact of factObjects) {
    const mentioned = allEntities.filter((e) => factMentionsEntity(fact.content, e));
    if (mentioned.length) {
      await linkEntitiesToFact(fact.id, mentioned);
      factEntityLinks += mentioned.length;
    }
  }

  return {
    entityCount: allEntities.length,
    relationCount,
    factEntityLinks,
    topics: topics.map((t) => t.name),
  };
}

function findFactMentioning(facts, term) {
  if (!term) return null;
  const lower = term.toLowerCase();
  return facts.find((f) => f.content?.toLowerCase().includes(lower)) || null;
}

// True if a fact's text mentions an entity by its canonical name OR by any
// stored alias. Word-boundary check on the fact text — using includes() would
// give false positives ("Sigil" matching "Sigilum"). Aliases are already
// lowercased in storage; the canonical name is lowercased here.
function factMentionsEntity(content, entity) {
  if (!content || !entity?.name) return false;
  const text = content.toLowerCase();
  const candidates = [entity.name.toLowerCase(), ...(entity.aliases || [])];
  return candidates.some((c) => {
    if (!c) return false;
    const re = new RegExp(`\\b${escapeRegex(c)}\\b`);
    return re.test(text);
  });
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { linkDocumentEntities };
