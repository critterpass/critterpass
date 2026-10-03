/**
 * Place mentions from a post or a screenshot (route `links.extract_places`, fast tier, no thinking,
 * no tools): "Two I'm sure of, one I need you for." The model lists what the post names; code keeps
 * only mentions whose words are in the post, and matching them to places (sure, pick one, unknown)
 * is code too. Anything short of a clean reply (the kill switch, a failed call, a decline, bad
 * JSON) reads as nothing found, and the screen offers a screenshot or a search. Metered by its own
 * silent fair-use cap, not the guide's.
 */
import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import {
  buildLinkExtractRequest,
  linkSourceText,
  LINK_EXTRACT_ROUTE,
  type LinkExtractInput,
} from './prompt';
import type { LinkExtractResult } from './schema';
import { checkLinkExtractReply } from './validate';

export * from './prompt';
export * from './schema';
export * from './validate';

const nothing = (reason: string): LinkExtractResult => ({ status: 'none', mentions: [], reason });

export async function extractPlaceMentions(
  gateway: Pick<Gateway, 'callModel'>,
  input: LinkExtractInput,
  options: { readonly signal?: AbortSignal; readonly usage?: UsageContext } = {},
): Promise<LinkExtractResult> {
  const sourceText = linkSourceText(input.source);
  if (sourceText.trim() === '') return nothing('empty');
  try {
    const request = buildLinkExtractRequest(input);
    const reply = await gateway.callModel(
      LINK_EXTRACT_ROUTE,
      options.signal ? { ...request, signal: options.signal } : request,
      options.usage ?? {},
    );
    if (isDeclined(reply.message)) return nothing('declined');
    return checkLinkExtractReply(parseStructuredText(textOf(reply.message)), sourceText);
  } catch {
    return nothing('call_failed');
  }
}
