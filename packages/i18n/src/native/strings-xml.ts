import type { NativeSegment } from './message-shape.js';
import { argOrderOf, parseForNative } from './message-shape.js';

/** Android string resources need apostrophes and `"`/`\` escaped with a backslash, and XML's own
 * `&`/`<`/`>` entity-escaped, on top of the ICU-to-Android placeholder substitution. */
function escapeAndroidValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

function renderAndroid(
  segments: readonly NativeSegment[],
  positions: Map<string, number>,
  pluralArg: string | undefined,
): string {
  const raw = segments
    .map((segment) => {
      if (segment.kind === 'text') return segment.value;
      const position = positions.get(segment.name);
      /* istanbul ignore next -- every arg name comes from argOrderOf, which always registers it */
      if (position === undefined) return '';
      const specifier = segment.name === pluralArg ? 'd' : 's';
      return `%${position}$${specifier}`;
    })
    .join('');
  return escapeAndroidValue(raw);
}

/** Android's resource-qualifier form of a BCP-47 tag, e.g. `zh-Hans` -> `b+zh+Hans` (API 21+, well
 * under this app's Android 36 minimum). */
export function androidLocaleQualifier(locale: string): string {
  return `b+${locale.replace(/-/g, '+')}`;
}

export interface StringsXmlOptions {
  readonly locale: string;
  /** message id -> source text for this locale; call once per locale, unlike xcstrings which takes every locale at once. */
  readonly messages: Readonly<Record<string, string>>;
  /** The source locale's own messages, to keep positional argument numbering consistent with xcstrings' output for the same ids. */
  readonly sourceMessages: Readonly<Record<string, string>>;
}

/** Builds one locale's `strings.xml` for the `surfaces` catalog (Android widget/notification surfaces). */
export function generateStringsXml(options: StringsXmlOptions): string {
  const { messages, sourceMessages } = options;
  const lines = ['<?xml version="1.0" encoding="utf-8"?>', '<resources>'];

  for (const [id, text] of Object.entries(messages)) {
    const sourceText = sourceMessages[id] ?? text;
    const sourceShape = parseForNative(sourceText, id);
    const positions = new Map(argOrderOf(sourceShape).map((name, index) => [name, index + 1]));
    const pluralArg = sourceShape.kind === 'plural' ? sourceShape.pluralArg : undefined;
    const shape = parseForNative(text, id);

    if (shape.kind === 'plain') {
      lines.push(
        `    <string name="${id}">${renderAndroid(shape.segments, positions, pluralArg)}</string>`,
      );
      continue;
    }

    lines.push(`    <plurals name="${id}">`);
    for (const [category, caseSegments] of shape.cases) {
      const value = renderAndroid(
        [...shape.prefix, ...caseSegments, ...shape.suffix],
        positions,
        pluralArg,
      );
      lines.push(`        <item quantity="${category}">${value}</item>`);
    }
    lines.push('    </plurals>');
  }

  lines.push('</resources>', '');
  return lines.join('\n');
}
