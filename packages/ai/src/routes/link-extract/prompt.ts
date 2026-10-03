/**
 * The `links.extract_places` request: what was read from a post (title, caption or description,
 * author) inside one untrusted `social_post` block, or the lines on-device OCR read from a
 * screenshot inside one `ocr_text` block, plus the destination and its area names. Nothing else
 * goes in, and nothing from the post is kept after the request.
 */
import type { ImportPlatform } from '@cp/domain';

import type { GatewayInput } from '../../client';
import { userTurnWithData, wrapUntrusted, UNTRUSTED_CONTEXT } from '../../context/wrap-untrusted';
import { LINK_EXTRACT_FORMAT, LINK_MENTIONS_MAX } from './schema';

export const LINK_EXTRACT_ROUTE = 'links.extract_places' as const;
export const LINK_EXTRACT_PROMPT_VERSION = 'link-extract@1';

/** The platforms whose post text is read (maps links and screenshots need no model read of a post). */
export const LINK_PLATFORMS = [
  'tiktok',
  'youtube',
  'instagram',
  'web',
] as const satisfies readonly ImportPlatform[];
export type LinkPlatform = (typeof LINK_PLATFORMS)[number];

export type LinkSource =
  | {
      readonly kind: 'post';
      readonly platform: LinkPlatform;
      /** The canonical post URL, the block's provenance. */
      readonly url: string;
      readonly title: string | null;
      /** Caption or description. */
      readonly text: string;
      readonly author: string | null;
    }
  | { readonly kind: 'screenshot'; readonly lines: readonly string[] };

export interface LinkExtractInput {
  readonly source: LinkSource;
  /** "Bali, Indonesia". */
  readonly destination: string;
  /** The destination's area names ("Ubud", "Canggu"), for area hints. */
  readonly areas: readonly string[];
}

const TASK = [
  '# Task',
  '',
  'Someone pasted a social post or a screenshot to add its places to their trip. List the places',
  'it names: restaurants, cafes, bars, temples, beaches, waterfalls, viewpoints, markets, shops,',
  'museums, swings, hikes. English or Vietnamese.',
  `- At most ${LINK_MENTIONS_MAX} mentions, in the order the post gives them, each place once.`,
  '- label: the words that name the place, copied exactly from the post (a hashtag without its #',
  '  is fine). A place described but not named ("the swing with the view") is labelled by those',
  '  exact words.',
  '- quote: the line or sentence it came from, copied exactly.',
  '- kind_hint: the kind of place. area_hint: the area the post puts it in, copied from the post,',
  '  or null.',
  '- Not places: the creator, people, hashtags that are not place names (#travel, #fyp), dishes,',
  '  hotels named only as sponsors, cities, countries and the destination itself.',
  '- destination: "this" when the post is about the trip destination, "other" when it is about',
  '  another city or country (then no mentions), "unclear" when it does not say.',
  '- Never add a place the post does not name, even one you know is nearby.',
  UNTRUSTED_CONTEXT,
].join('\n');

/** The task text, shared with the Gemini variant for screenshots and videos (./media.ts). */
export function linkExtractTask(): string {
  return TASK;
}

function sourceBlock(source: LinkSource) {
  if (source.kind === 'screenshot') {
    return wrapUntrusted({
      kind: 'ocr_text',
      text: source.lines.join('\n'),
      source: 'screenshot',
      label: 'Screenshot',
    });
  }
  const text = [source.title ?? '', source.text].filter((part) => part.trim() !== '').join('\n\n');
  return wrapUntrusted({
    kind: 'social_post',
    text,
    source: source.url,
    label: [source.platform, source.author ?? ''].filter(Boolean).join(' · '),
  });
}

export function buildLinkExtractRequest(input: LinkExtractInput): GatewayInput {
  const areas = input.areas.length === 0 ? '' : ` Its areas: ${input.areas.join(', ')}.`;
  return {
    system: [{ type: 'text', text: TASK }],
    messages: [
      userTurnWithData(`The trip is to ${input.destination}.${areas} List the places.`, [
        sourceBlock(input.source),
      ]),
    ],
    outputFormat: LINK_EXTRACT_FORMAT,
    temperature: 0,
  };
}

/** The text the mentions must come from: what the model was shown, title and author included. */
export function linkSourceText(source: LinkSource): string {
  return source.kind === 'screenshot'
    ? source.lines.join('\n')
    : [source.title ?? '', source.text, source.author ?? ''].join('\n');
}
