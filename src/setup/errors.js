/**
 * The one error type every setup step throws. The setup service relays
 * { message, hint, kind } to the GUI verbatim. `kind` is a stable machine tag
 * the UI can branch on (e.g. 'no-pgvector', 'bad-key', 'llm').
 */
export class StepError extends Error {
  constructor({ message, hint, kind }) {
    super(message);
    this.name = 'StepError';
    this.hint = hint || null;
    this.kind = kind || 'other';
  }
}
