#!/usr/bin/env node

/**
 * LongMemEval harness for Cortex.
 *
 * For each question:
 *   1. Wipe a per-question namespace `lme-<qid>` (one profile per question — Ogham's
 *      isolation trick, prevents cross-contamination).
 *   2. Ingest each haystack_session as a separate document. The session_id is recorded
 *      in document.sourcePath so we can map a retrieved fact/chunk back to its session.
 *   3. Run the question against that namespace (synthesize=true).
 *   4. Compute Recall@K: does any retrieved fact/chunk come from a session in
 *      `answer_session_ids`?
 *   5. Optionally LLM-judge the synthesized answer against the gold answer.
 *
 * Usage:
 *   node eval/longmemeval/run-eval.js --n=20 --judge=false
 *   node eval/longmemeval/run-eval.js --n=20 --judge=true   # adds LLM-as-judge ($$)
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { config as dotenvConfig } from 'dotenv';

const globalEnv = join(homedir(), '.cortex', '.env');
const projectEnv = resolve(process.cwd(), '.env');
if (existsSync(globalEnv)) dotenvConfig({ path: globalEnv, quiet: true });
if (existsSync(projectEnv)) dotenvConfig({ path: projectEnv, quiet: true, override: true });

const config = (await import('../../src/config.js')).default;
const cortexDb = (await import('../../src/db/cortex.js')).default;
const { ingestDocument } = await import('../../src/ingestion/pipeline.js');
const { search } = await import('../../src/memory/search/hybrid.js');
const { deleteNamespace } = await import('../../src/memory/facts/store.js');
const { prompt: llmPrompt } = await import('../../src/lib/llm.js');

const __filename = fileURLToPath(import.meta.url);
const HERE = dirname(__filename);
const DATASET = join(HERE, 'longmemeval_oracle.json');
const REPORTS_DIR = join(HERE, 'reports');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const n = Number(args.n) || 20;
  const judge = args.judge === 'true';
  const startAt = Number(args.start) || 0;
  const reportName = args.report || `lme-n${n}-${new Date().toISOString().slice(0,10)}.json`;

  await mkdir(REPORTS_DIR, { recursive: true });

  console.log(`\n=== LongMemEval / Cortex ===`);
  console.log(`Config: synthesize=${config.search.synthesize} eagerExtract=${config.ingest.eagerExtract}`);
  console.log(`Sample: ${n} questions starting at index ${startAt}, judge=${judge}`);

  const dataset = JSON.parse(await readFile(DATASET, 'utf8'));
  const questions = dataset.slice(startAt, startAt + n);
  console.log(`Loaded ${questions.length} questions from oracle split.\n`);

  const results = [];
  let totalCostBefore = await getTotalCost();
  const t0 = Date.now();

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const namespace = `lme-${q.question_id}`;
    process.stdout.write(`[${i + 1}/${questions.length}] ${q.question_id} (${q.question_type}) `);

    // 1. Reset namespace + clear any previous lme-* namespace docs sharing source paths
    await resetLmeNamespaces();

    // 2. Ingest each session as a doc
    const sessionIngests = [];
    for (let s = 0; s < q.haystack_sessions.length; s++) {
      const sessionId = q.haystack_session_ids[s];
      const sessionDate = q.haystack_dates[s];
      const sessionTurns = q.haystack_sessions[s];
      const sourcePath = `lme://${q.question_id}/${sessionId}`;
      const title = `${sessionId} (${sessionDate})`;
      const content = renderSessionAsMarkdown(title, sessionDate, sessionTurns);

      const tIngest = Date.now();
      const result = await ingestDocument({
        content,
        title,
        sourcePath,
        sourceType: 'chat',
        contentType: 'text/markdown',
        namespace,
        classify: false,
      });
      sessionIngests.push({
        sessionId,
        sessionDate,
        documentId: result.documentId,
        chunkCount: result.chunkCount,
        factCount: result.facts?.total ?? 0,
        durationMs: Date.now() - tIngest,
        skipped: !!result.skipped,
      });
    }

    // 3. Run the query
    const tQuery = Date.now();
    let resp;
    let queryError = null;
    try {
      resp = await search(q.question, {
        namespaces: [namespace],
        limit: 10,
        useGraph: false,
        includeChunks: true,
        route: false,
      });
    } catch (err) {
      queryError = err.message;
      resp = { facts: [], chunks: [] };
    }
    const queryDurationMs = Date.now() - tQuery;

    // 4. Map retrieved items back to source session IDs
    const docIdToSession = {};
    for (const si of sessionIngests) {
      if (si.documentId) docIdToSession[si.documentId] = si.sessionId;
    }
    const retrievedSessionsTopK = (k) => {
      const ranked = [
        ...resp.facts.map((f) => ({ rank: 1, kind: 'fact', docIds: f.sourceDocumentIds || [] })),
        ...resp.chunks.map((c) => ({ rank: 1, kind: 'chunk', docIds: c.documentId ? [c.documentId] : [] })),
      ];
      const sessions = [];
      const seen = new Set();
      for (let r = 0; r < ranked.length && sessions.length < k; r++) {
        for (const docId of ranked[r].docIds) {
          const sid = docIdToSession[docId];
          if (sid && !seen.has(sid)) {
            seen.add(sid);
            sessions.push(sid);
          }
        }
      }
      return sessions;
    };

    const expectedSessions = new Set(q.answer_session_ids);
    const top1Sessions = retrievedSessionsTopK(1);
    const top3Sessions = retrievedSessionsTopK(3);
    const top10Sessions = retrievedSessionsTopK(10);

    const recall1 = top1Sessions.some((s) => expectedSessions.has(s));
    const recall3 = top3Sessions.some((s) => expectedSessions.has(s));
    const recall10 = top10Sessions.some((s) => expectedSessions.has(s));

    // 5. Optional LLM-as-judge
    let judgement = null;
    if (judge && resp.synthesized) {
      try {
        judgement = await judgeAnswer(q.question, q.answer, resp.synthesized);
      } catch (err) {
        judgement = { correct: null, reasoning: `judge failed: ${err.message}` };
      }
    }

    process.stdout.write(`R@1=${recall1 ? '✓' : '✗'} R@3=${recall3 ? '✓' : '✗'} R@10=${recall10 ? '✓' : '✗'}`);
    if (judge && judgement) process.stdout.write(` judge=${judgement.correct ? '✓' : '✗'}`);
    process.stdout.write('\n');

    results.push({
      questionId: q.question_id,
      questionType: q.question_type,
      question: q.question,
      goldAnswer: q.answer,
      answerSessionIds: q.answer_session_ids,
      sessionIngests,
      queryDurationMs,
      queryError,
      synthesized: resp.synthesized || null,
      retrieved: {
        top1: top1Sessions,
        top3: top3Sessions,
        top10: top10Sessions,
      },
      recall: { '@1': recall1, '@3': recall3, '@10': recall10 },
      judgement,
    });
  }

  // Aggregate
  const totalCostAfter = await getTotalCost();
  const aggregate = aggregateMetrics(results);
  aggregate.totalCostUsd = totalCostAfter - totalCostBefore;
  aggregate.totalDurationMs = Date.now() - t0;
  aggregate.config = {
    synthesize: config.search.synthesize,
    eagerExtract: config.ingest.eagerExtract,
    embeddingProvider: config.embedding.provider || '(auto)',
    embeddingModel: config.embedding.model,
  };

  console.log(`\n=== Aggregate ===`);
  console.log(`R@1: ${(aggregate.recall1 * 100).toFixed(1)}%   R@3: ${(aggregate.recall3 * 100).toFixed(1)}%   R@10: ${(aggregate.recall10 * 100).toFixed(1)}%`);
  if (judge) console.log(`Answer correctness: ${(aggregate.judgeCorrect * 100).toFixed(1)}%`);
  console.log(`Per question type:`);
  for (const [type, m] of Object.entries(aggregate.byType)) {
    console.log(`  ${type.padEnd(28)} R@1=${(m.recall1 * 100).toFixed(0).padStart(3)}%  R@3=${(m.recall3 * 100).toFixed(0).padStart(3)}%  R@10=${(m.recall10 * 100).toFixed(0).padStart(3)}%  (n=${m.n})`);
  }
  console.log(`\nTotal cost: $${aggregate.totalCostUsd.toFixed(4)}, total time: ${(aggregate.totalDurationMs / 1000).toFixed(0)}s`);

  const reportPath = join(REPORTS_DIR, reportName);
  await writeFile(reportPath, JSON.stringify({ aggregate, results }, null, 2));
  console.log(`Report: ${reportPath}`);

  await cortexDb.destroy();
  process.exit(0);
}

function renderSessionAsMarkdown(title, date, turns) {
  const lines = [`# ${title}`, `Date: ${date}`, ''];
  for (const turn of turns) {
    const role = turn.role === 'user' ? 'User' : turn.role === 'assistant' ? 'Assistant' : turn.role;
    lines.push(`**${role}:** ${turn.content}`);
    lines.push('');
  }
  return lines.join('\n');
}

async function judgeAnswer(question, goldAnswer, predictedAnswer) {
  const judgePrompt = `You are evaluating a memory system's answer.

Question: ${question}

Gold answer: ${goldAnswer}

Predicted answer: ${predictedAnswer}

Decide whether the predicted answer is substantively correct compared to the gold answer. Wording can differ, but the predicted answer must convey the same factual content. If the predicted answer says it cannot find the information ("Not in retrieved memory" or similar), mark it incorrect since the gold is non-empty.

Respond with exactly:
CORRECT - <one-line reason>
or
INCORRECT - <one-line reason>`;

  const response = await llmPrompt(judgePrompt, { caller: 'lme-judge' });
  const trimmed = response.trim();
  const correct = /^CORRECT/i.test(trimmed);
  const reason = trimmed.replace(/^(CORRECT|INCORRECT)\s*-\s*/i, '').slice(0, 300);
  return { correct, reasoning: reason };
}

function aggregateMetrics(results) {
  const n = results.length;
  const recall1 = results.filter((r) => r.recall['@1']).length / n;
  const recall3 = results.filter((r) => r.recall['@3']).length / n;
  const recall10 = results.filter((r) => r.recall['@10']).length / n;
  const judged = results.filter((r) => r.judgement);
  const judgeCorrect = judged.length ? judged.filter((r) => r.judgement.correct).length / judged.length : null;

  // Per-type breakdown
  const types = {};
  for (const r of results) {
    if (!types[r.questionType]) types[r.questionType] = [];
    types[r.questionType].push(r);
  }
  const byType = {};
  for (const [type, rs] of Object.entries(types)) {
    byType[type] = {
      n: rs.length,
      recall1: rs.filter((r) => r.recall['@1']).length / rs.length,
      recall3: rs.filter((r) => r.recall['@3']).length / rs.length,
      recall10: rs.filter((r) => r.recall['@10']).length / rs.length,
    };
  }

  return { n, recall1, recall3, recall10, judgeCorrect, byType };
}

async function getTotalCost() {
  const row = await cortexDb('llm_log').sum({ total: 'cost' }).first();
  return Number(row.total || 0);
}

async function resetLmeNamespaces() {
  const rows = await cortexDb('document').distinct('namespace').where('namespace', 'like', 'lme-%');
  for (const { namespace } of rows) {
    try { await deleteNamespace(namespace); } catch (err) { console.error(`reset ${namespace} failed:`, err.message); }
  }
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

main().catch((err) => { console.error('Eval failed:', err); process.exit(1); });
