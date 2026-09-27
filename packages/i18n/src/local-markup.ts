/**
 * Guide dialogue keeps local words in their own language regardless of the active UI locale, marked
 * up as `<local lang="id">Terima kasih</local>` in the message source (design-system.md §6
 * "Mixed-language"). This parses that markup into plain/local spans for two consumers: a renderer
 * that needs to tag the local span for screen readers/TTS (`lang` attribute), and the Tolgee
 * glossary, which locks the span's text so it is never translated.
 */

export interface LocalMarkupSpan {
  readonly text: string;
  /** BCP-47 tag of the local word's own language; absent for the surrounding (translatable) text. */
  readonly lang?: string;
}

const LOCAL_TAG = /<local lang="([a-zA-Z-]+)">([\s\S]*?)<\/local>/g;

export function parseLocalMarkup(input: string): LocalMarkupSpan[] {
  const spans: LocalMarkupSpan[] = [];
  let cursor = 0;

  for (const match of input.matchAll(LOCAL_TAG)) {
    const [full, lang, text] = match;
    if (match.index === undefined || lang === undefined || text === undefined) continue;
    if (match.index > cursor) spans.push({ text: input.slice(cursor, match.index) });
    spans.push({ text, lang });
    cursor = match.index + full.length;
  }

  if (cursor < input.length) spans.push({ text: input.slice(cursor) });
  return spans;
}
