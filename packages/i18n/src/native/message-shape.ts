import { parse } from '@messageformat/parser';
import type { Content, FunctionArg, PlainArg, Select } from '@messageformat/parser';

/** A message reduced to what native string catalogs can express: plain text and named
 * placeholders, with at most one plural construct spanning the whole message. */
export type NativeSegment =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'arg'; readonly name: string };

export interface PlainNativeMessage {
  readonly kind: 'plain';
  readonly segments: readonly NativeSegment[];
}

export interface PluralNativeMessage {
  readonly kind: 'plural';
  readonly pluralArg: string;
  /** Segments before/after the plural construct, repeated into every category's own string
   * (xcstrings/strings.xml plurals hold one full string per category, not just the varying part). */
  readonly prefix: readonly NativeSegment[];
  readonly suffix: readonly NativeSegment[];
  readonly cases: ReadonlyMap<string, readonly NativeSegment[]>;
}

export type NativeMessage = PlainNativeMessage | PluralNativeMessage;

/** Thrown for an ICU construct native string catalogs cannot express, naming the message id
 * (never a plan/task id — see the class's own callers) so the release build points at the source. */
export class UnsupportedNativeMessageError extends Error {
  constructor(messageId: string, reason: string) {
    super(`surfaces message "${messageId}" cannot be expressed as a native string: ${reason}`);
  }
}

type Token = Content | PlainArg | FunctionArg | Select;

function flattenPlain(tokens: readonly Token[], messageId: string): NativeSegment[] {
  const segments: NativeSegment[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'content':
        segments.push({ kind: 'text', value: token.value });
        break;
      case 'argument':
      case 'function':
        segments.push({ kind: 'arg', name: token.arg });
        break;
      case 'plural':
      case 'selectordinal':
      case 'select':
        throw new UnsupportedNativeMessageError(
          messageId,
          `a ${token.type} construct appears alongside other content native plural variations cannot nest (only one plural, spanning the whole message, is supported)`,
        );
      /* istanbul ignore next -- exhaustiveness guard, @messageformat/parser's own token union is closed */
      default:
        throw new UnsupportedNativeMessageError(messageId, 'unrecognised message construct');
    }
  }
  return segments;
}

/** Only `plural`/`selectordinal` cases (`content`/`argument`/`function`/octothorpe) are supported
 * inside a case; `#` becomes a reference to the plural's own argument. */
function flattenCase(
  tokens: readonly (Token | { type: 'octothorpe' })[],
  pluralArg: string,
  messageId: string,
): NativeSegment[] {
  const segments: NativeSegment[] = [];
  for (const token of tokens) {
    if (token.type === 'octothorpe') {
      segments.push({ kind: 'arg', name: pluralArg });
      continue;
    }
    segments.push(...flattenPlain([token], messageId));
  }
  return segments;
}

export function parseForNative(message: string, messageId: string): NativeMessage {
  let tokens: ReturnType<typeof parse>;
  try {
    tokens = parse(message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UnsupportedNativeMessageError(messageId, `invalid ICU syntax (${reason})`);
  }

  const pluralIndex = tokens.findIndex((token) => token.type === 'plural');
  const hasOtherSelect = tokens.some(
    (token, index) => index !== pluralIndex && (token.type === 'select' || token.type === 'selectordinal'),
  );
  if (hasOtherSelect) {
    throw new UnsupportedNativeMessageError(
      messageId,
      'select/selectordinal have no native plural-style equivalent on iOS or Android',
    );
  }
  const extraPlural = tokens.filter((token) => token.type === 'plural').length > 1;
  if (extraPlural) {
    throw new UnsupportedNativeMessageError(
      messageId,
      'more than one plural construct in a single message (native "substitutions" for independent plural arguments are not supported yet)',
    );
  }

  if (pluralIndex === -1) {
    return { kind: 'plain', segments: flattenPlain(tokens, messageId) };
  }

  const pluralToken = tokens[pluralIndex];
  if (pluralToken?.type !== 'plural') {
    throw new UnsupportedNativeMessageError(messageId, 'unrecognised message construct');
  }
  const cases = new Map<string, readonly NativeSegment[]>();
  for (const pluralCase of pluralToken.cases) {
    cases.set(pluralCase.key, flattenCase(pluralCase.tokens, pluralToken.arg, messageId));
  }

  return {
    kind: 'plural',
    pluralArg: pluralToken.arg,
    prefix: flattenPlain(tokens.slice(0, pluralIndex), messageId),
    suffix: flattenPlain(tokens.slice(pluralIndex + 1), messageId),
    cases,
  };
}

/**
 * Positional argument order for a message, derived once from its source-locale text so every
 * locale's translation numbers the same argument name the same way even if it reorders them (e.g.
 * German moving the count after the name) — native platforms' `%1$@`/`%1$s` style specifiers are
 * positional for exactly this reason.
 */
export function argOrderOf(message: NativeMessage): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (segments: readonly NativeSegment[]) => {
    for (const segment of segments) {
      if (segment.kind === 'arg' && !seen.has(segment.name)) {
        seen.add(segment.name);
        order.push(segment.name);
      }
    }
  };
  if (message.kind === 'plain') {
    visit(message.segments);
  } else {
    visit(message.prefix);
    for (const caseSegments of message.cases.values()) visit(caseSegments);
    visit(message.suffix);
  }
  return order;
}
