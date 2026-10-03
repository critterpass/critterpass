/**
 * Place mentions from what has no text to read: a screenshot on-device OCR found no words in, or
 * a public YouTube video (route `links.extract_places` on the Gemini fallback, only when
 * `ai.gemini_vision` is on). Same task and reply as the text variant; with no text to hold the
 * words against, code keeps a mention only when its label reads as a name (letters, within length)
 * and counts each once; matching mentions to real places stays code, as for text. A video read
 * this way is the only case the copy may say it watched. A refusal or a failed call finds nothing.
 */
import type { GeminiMedia, GeminiVision } from '../../providers/gemini';
import { parseStructuredText } from '../../structured';
import type { UsageContext } from '../../usage';
import { linkExtractTask, LINK_EXTRACT_ROUTE } from './prompt';
import {
  linkExtractReplySchema,
  LINK_EXTRACT_FORMAT,
  LINK_LABEL_MAX,
  LINK_MENTIONS_MAX,
  LINK_QUOTE_MAX,
  type LinkExtractResult,
  type PlaceMention,
} from './schema';
import { squash } from './validate';

export interface MediaExtractInput {
  readonly media: GeminiMedia;
  readonly destination: string;
  readonly areas: readonly string[];
}

const nothing = (reason: string): LinkExtractResult => ({ status: 'none', mentions: [], reason });

/** Checks a reply read from an image or a video, where no source text exists to hold it against. */
export function checkMediaReply(raw: unknown): LinkExtractResult {
  const parsed = linkExtractReplySchema.safeParse(raw);
  if (!parsed.success) return nothing('shape');
  if (parsed.data.destination === 'other') return { status: 'other_destination', mentions: [] };
  const seen = new Set<string>();
  const mentions: PlaceMention[] = [];
  for (const mention of parsed.data.mentions) {
    const label = mention.label.trim().replace(/\s+/gu, ' ').replace(/^#/u, '');
    const key = squash(label);
    if (key.length < 3 || label.length > LINK_LABEL_MAX || seen.has(key)) continue;
    if (!/\p{L}/u.test(label)) continue;
    seen.add(key);
    const area = mention.area_hint?.trim() ?? '';
    mentions.push({
      label,
      kind_hint: mention.kind_hint,
      ...(area === '' ? {} : { area_hint: area.slice(0, LINK_LABEL_MAX) }),
      quote: mention.quote.trim().slice(0, LINK_QUOTE_MAX),
    });
    if (mentions.length === LINK_MENTIONS_MAX) break;
  }
  return mentions.length === 0 ? nothing('no_mentions') : { status: 'found', mentions };
}

export async function extractPlaceMentionsFromMedia(
  gemini: GeminiVision,
  input: MediaExtractInput,
  options: { readonly signal?: AbortSignal; readonly usage?: UsageContext } = {},
): Promise<LinkExtractResult> {
  const areas = input.areas.length === 0 ? '' : ` Its areas: ${input.areas.join(', ')}.`;
  const what =
    input.media.kind === 'video' ? 'video (what is said, shown and captioned)' : 'screenshot';
  try {
    const result = await gemini.call(
      LINK_EXTRACT_ROUTE,
      {
        system: linkExtractTask(),
        text: `The trip is to ${input.destination}.${areas} List the places this ${what} names.`,
        media: input.media,
        outputFormat: LINK_EXTRACT_FORMAT,
        maxOutputTokens: 2048,
        ...(options.signal ? { signal: options.signal } : {}),
      },
      options.usage ?? {},
    );
    return checkMediaReply(parseStructuredText(result.text));
  } catch {
    return nothing('call_failed');
  }
}
