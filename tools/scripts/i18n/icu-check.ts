/**
 * A structural sanity check for ICU MessageFormat syntax: balanced braces, and, for any
 * `{arg, type, ...}` construct, a recognised ICU argument type. Deliberately not a full ICU
 * grammar validator — `packages/i18n/src/native/message-shape.ts` uses the real one
 * (`@messageformat/parser`) for the native string generators, but `tools/scripts/package.json` is
 * outside this phase's file ownership, so this script cannot declare that dependency itself (see
 * the report's open-issue note recommending that once someone can touch that file). Good enough to
 * catch a translator breaking brace balance or the argument type keyword, the most common ways a
 * translation corrupts otherwise-working ICU syntax.
 */

const KNOWN_ARGUMENT_TYPES = new Set([
  'plural',
  'select',
  'selectordinal',
  'number',
  'date',
  'time',
  'spellout',
  'ordinal',
  'duration',
]);

const ARGUMENT_HEAD = /\{\s*[^{},]+\s*,\s*([a-zA-Z]+)\s*,/g;

/** Returns a description of the first problem found, or `null` if the message looks structurally sound. */
export function checkIcuSyntax(message: string): string | null {
  let depth = 0;
  for (const char of message) {
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth < 0) return 'unmatched closing "}"';
    }
  }
  if (depth > 0) return `unbalanced braces (missing ${depth} closing "}")`;
  if (depth < 0) return `unbalanced braces (${-depth} extra closing "}")`;

  for (const match of message.matchAll(ARGUMENT_HEAD)) {
    const type = match[1];
    if (type !== undefined && !KNOWN_ARGUMENT_TYPES.has(type)) {
      return `unrecognised ICU argument type "${type}"`;
    }
  }

  return null;
}
