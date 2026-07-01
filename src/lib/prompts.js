/**
 * Prompt resolution + loading with a per-instance overlay.
 *
 * Precedence (checked at CALL time, so dropping a file in the overlay takes
 * effect without a daemon restart):
 *   1. ~/.sigil/prompts/<name>  — user/instance override (SIGIL_PROMPTS_DIR)
 *   2. <pkg>/prompts/<name>     — the packaged default (PROMPTS_DIR)
 *
 * This is the single door every prompt read goes through, so customizing a
 * prompt (or localizing it — see loadPrompt's {{placeholder}} substitution)
 * never means editing the installed package.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { PROMPTS_DIR, SIGIL_PROMPTS_DIR } from './paths.js';

// Resolve a prompt file name to an absolute path: overlay wins, else package.
export function resolvePromptPath(name) {
  const overlay = join(SIGIL_PROMPTS_DIR, name);
  return existsSync(overlay) ? overlay : join(PROMPTS_DIR, name);
}

// Build the language instruction appended to extraction / classification
// system prompts. Empty when no language is set, so behavior is unchanged for
// installs that never configure one. Keeps technical tokens verbatim so PT-BR
// (or any language) never mangles identifiers / paths / commands.
export function languageDirective(lang) {
  if (!lang) return '';
  return `\n\n---\nLANGUAGE REQUIREMENT: Write every fact's \`content\` field in ${lang}. `
    + 'Keep code identifiers, file paths, commands, URLs, and proper nouns verbatim. '
    + 'This constrains the stored text only — JSON keys and enum values (category, '
    + 'confidence, importance) stay in English.';
}

// Load a prompt's text, substituting {{key}} placeholders from `vars`.
// A null/undefined var collapses to '' so an un-provided placeholder never
// leaks the literal `{{key}}` into the model input.
export async function loadPrompt(name, vars = {}) {
  let text = await readFile(resolvePromptPath(name), 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{{${k}}}`, v === null || v === undefined ? '' : String(v));
  }
  return text;
}
