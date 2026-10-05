/**
 * The second source for a place's fee, hours and closures (route `place.profile_check`, pro tier,
 * no thinking): DeepSeek's own web search (its server `web_search` tool, at most two searches)
 * answers three fields as JSON. Only the place's names and city go into the search (D23). The
 * answer is never shown: it only decides whether a fee or hours line from our own pages is kept.
 */
import type Anthropic from '@anthropic-ai/sdk';

import type { Gateway } from '../../client';
import { textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import type { ProfilePlace } from './prompt';
import type { SecondSourceAnswer } from './validate';

export const PLACE_PROFILE_CHECK_ROUTE = 'place.profile_check' as const;

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 2,
} as const satisfies Anthropic.Messages.WebSearchTool20250305;

export interface SecondSourceResult {
  /** Null when the reply held no readable JSON. */
  readonly answer: SecondSourceAnswer | null;
  /** The pages the search returned (titles and URLs only; their text is not given to us). */
  readonly urls: readonly string[];
  readonly costMicros: number;
}

const field = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** Reads the JSON answer and the search's result URLs out of one reply. */
export function readSecondSource(message: Pick<Anthropic.Messages.Message, 'content'>): {
  answer: SecondSourceAnswer | null;
  urls: string[];
} {
  const urls = message.content.flatMap((block) =>
    block.type === 'web_search_tool_result' && Array.isArray(block.content)
      ? block.content.map((result) => result.url)
      : [],
  );
  const text = textOf(message);
  let answer: SecondSourceAnswer | null;
  try {
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<
      string,
      unknown
    >;
    answer = {
      entry_fee: field(json['entry_fee']),
      hours: field(json['hours']),
      closed_or_renovating: field(json['closed_or_renovating']),
    };
  } catch {
    answer = null;
  }
  return { answer, urls: [...new Set(urls)].slice(0, 8) };
}

export async function checkSecondSource(
  gateway: Pick<Gateway, 'callModel'>,
  place: Pick<ProfilePlace, 'name' | 'nameLocal' | 'town' | 'country'>,
  options: { readonly signal?: AbortSignal; readonly usage?: UsageContext } = {},
): Promise<SecondSourceResult> {
  const names = place.nameLocal === null ? place.name : `${place.nameLocal} (${place.name})`;
  const where = place.country === null ? place.town : `${place.town}, ${place.country}`;
  const result = await gateway.callModel(
    PLACE_PROFILE_CHECK_ROUTE,
    {
      messages: [
        {
          role: 'user',
          content: `${names}, ${where}. Search the web, then reply with JSON only: {"entry_fee": string|null (adult, as written), "hours": string|null, "closed_or_renovating": string|null, "urls": [string]}.`,
        },
      ],
      tools: [WEB_SEARCH_TOOL],
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
    options.usage ?? {},
  );
  return { ...readSecondSource(result.message), costMicros: result.costMicros };
}
