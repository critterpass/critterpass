/**
 * Code-side checks on a `links.extract_places` reply: a mention survives only when its label and
 * its quote are both in the post (accents, case, spacing and punctuation folded away, so a label
 * read from "#TukadCepung" matches), so an invented place never reaches matching. An area hint the
 * post does not carry is dropped; repeated labels count once; at most ten mentions.
 */
import { foldText } from '../search-parse/validate';
import {
  linkExtractReplySchema,
  LINK_LABEL_MAX,
  LINK_MENTIONS_MAX,
  LINK_QUOTE_MAX,
  type LinkExtractResult,
  type PlaceMention,
} from './schema';

/** Shortest label worth matching, in letters and digits. */
const LABEL_MIN = 3;

/** Letters and digits only, folded: the form both sides are compared in. */
export function squash(text: string): string {
  return foldText(text).replace(/[^\p{L}\p{N}]+/gu, '');
}

const clean = (text: string): string => text.trim().replace(/\s+/gu, ' ');

/** Checks one parsed reply against the text it was read from. */
export function checkLinkExtractReply(raw: unknown, sourceText: string): LinkExtractResult {
  const parsed = linkExtractReplySchema.safeParse(raw);
  if (!parsed.success) return { status: 'none', mentions: [], reason: 'shape' };
  if (parsed.data.destination === 'other') return { status: 'other_destination', mentions: [] };
  const source = squash(sourceText);
  const seen = new Set<string>();
  const mentions: PlaceMention[] = [];
  for (const mention of parsed.data.mentions) {
    const label = clean(mention.label).replace(/^#/u, '');
    const quote = clean(mention.quote);
    const key = squash(label);
    if (key.length < LABEL_MIN || label.length > LINK_LABEL_MAX || seen.has(key)) continue;
    if (!source.includes(key) || quote === '' || !source.includes(squash(quote))) continue;
    seen.add(key);
    const area = mention.area_hint === null ? '' : clean(mention.area_hint);
    mentions.push({
      label,
      kind_hint: mention.kind_hint,
      ...(area !== '' && squash(area).length > 0 && source.includes(squash(area))
        ? { area_hint: area }
        : {}),
      quote: quote.slice(0, LINK_QUOTE_MAX),
    });
    if (mentions.length === LINK_MENTIONS_MAX) break;
  }
  return mentions.length === 0
    ? { status: 'none', mentions: [], reason: 'no_mentions' }
    : { status: 'found', mentions };
}
