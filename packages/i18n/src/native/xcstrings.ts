import type { NativeSegment } from './message-shape';
import { argOrderOf, parseForNative } from './message-shape';

function renderApple(
  segments: readonly NativeSegment[],
  positions: Map<string, number>,
  pluralArg: string | undefined,
): string {
  return segments
    .map((segment) => {
      if (segment.kind === 'text') return segment.value;
      const position = positions.get(segment.name);
      /* istanbul ignore next -- every arg name comes from argOrderOf, which always registers it */
      if (position === undefined) return '';
      const specifier = segment.name === pluralArg ? 'lld' : '@';
      return `%${position}$${specifier}`;
    })
    .join('');
}

export interface XcstringsOptions {
  readonly sourceLocale: string;
  /** locale -> (message id -> source text for that locale); a locale missing an id has not been translated yet. */
  readonly messagesByLocale: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/**
 * Builds an Xcode String Catalog (`.xcstrings`) from the `surfaces` catalog's ICU messages, for
 * widget/notification-content extensions that render outside the JS runtime. Only messages
 * `message-shape.ts` can express are supported; a `select`/nested plural throws with the message id.
 */
export function generateXcstrings(options: XcstringsOptions): string {
  const { sourceLocale, messagesByLocale } = options;
  const sourceMessages = messagesByLocale[sourceLocale] ?? {};
  const strings: Record<string, unknown> = {};

  for (const [id, sourceText] of Object.entries(sourceMessages)) {
    const sourceShape = parseForNative(sourceText, id);
    const order = argOrderOf(sourceShape);
    const positions = new Map(order.map((name, index) => [name, index + 1]));
    const pluralArg = sourceShape.kind === 'plural' ? sourceShape.pluralArg : undefined;

    const localizations: Record<string, unknown> = {};
    for (const [locale, messages] of Object.entries(messagesByLocale)) {
      const text = messages[id];
      if (text === undefined) continue;
      const shape = locale === sourceLocale ? sourceShape : parseForNative(text, id);

      if (shape.kind === 'plain') {
        localizations[locale] = {
          stringUnit: {
            state: 'translated',
            value: renderApple(shape.segments, positions, pluralArg),
          },
        };
        continue;
      }

      const variations: Record<string, { stringUnit: { state: string; value: string } }> = {};
      for (const [category, caseSegments] of shape.cases) {
        const value = [...shape.prefix, ...caseSegments, ...shape.suffix];
        variations[category] = {
          stringUnit: { state: 'translated', value: renderApple(value, positions, pluralArg) },
        };
      }
      localizations[locale] = { variations: { plural: variations } };
    }

    strings[id] = { extractionState: 'manual', localizations };
  }

  return `${JSON.stringify({ sourceLanguage: sourceLocale, version: '1.0', strings }, null, 2)}\n`;
}
