import config from '../config.js';
import { EMBEDDING_DIM } from './constants.js';

/**
 * Format a numeric array as a pgvector-compatible string literal.
 * Centralizes the `[1,2,3]` formatting used across all stores and search modules.
 *
 * `assertDim` is the last-resort guard for INSERT paths: refuse to serialize a
 * vector whose length isn't EMBEDDING_DIM, so a bad vector that somehow bypassed
 * the embed boundary (embedBatchOrThrow) still can't reach the column silently.
 * Off by default — update paths intentionally pass null/undefined to skip the
 * embedding column.
 */
function pgVector(arr, { assertDim = false } = {}) {
  if (!arr) return null;
  if (assertDim && (!Array.isArray(arr) || arr.length !== EMBEDDING_DIM)) {
    const err = new Error(`refusing to store ${Array.isArray(arr) ? arr.length : typeof arr}-dim vector; expected ${EMBEDDING_DIM}`);
    err.code = 'embedding_invalid';
    throw err;
  }
  return `[${arr.join(',')}]`;
}

function embeddingDimensions() {
  const dim = Number(config.embedding.dimensions) || 768;
  if (!Number.isInteger(dim) || dim <= 0) {
    throw new Error(`Invalid EMBEDDING_DIMENSIONS: ${config.embedding.dimensions}`);
  }
  return dim;
}

function pgHalfvecColumn(column = 'embedding') {
  return `(${column}::halfvec(${embeddingDimensions()}))`;
}

function pgHalfvecParam() {
  return `?::halfvec(${embeddingDimensions()})`;
}

export { pgVector, pgHalfvecColumn, pgHalfvecParam };
