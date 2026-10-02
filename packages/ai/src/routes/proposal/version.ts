/**
 * One recipient's personal version: the guide writes it, the validator checks every id and number
 * against what was injected, and anything short of a clean reply (a failed call, a decline, bad
 * JSON, an invented number, another member's name) is reported as rejected so the job can retry
 * and then fall back to the crew's shared version.
 */
import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import { keepGoodLabels, validateVersion } from './validate';
import { buildVersionRequest, VERSION_ROUTE } from './version.prompt';
import { versionReplySchema, type VersionContext, type VersionReply } from './version.schema';

export type VersionResult =
  | { readonly ok: true; readonly reply: VersionReply }
  | { readonly ok: false; readonly rejected: string };

export async function writeVersion(
  gateway: Pick<Gateway, 'callModel'>,
  context: VersionContext,
  usage: UsageContext = {},
): Promise<VersionResult> {
  try {
    const result = await gateway.callModel(VERSION_ROUTE, buildVersionRequest(context), usage);
    if (isDeclined(result.message)) return { ok: false, rejected: 'declined' };
    const reply = versionReplySchema.safeParse(parseStructuredText(textOf(result.message)));
    if (!reply.success) return { ok: false, rejected: 'unparseable' };
    const verdict = validateVersion(reply.data, context);
    return verdict.ok
      ? { ok: true, reply: keepGoodLabels(reply.data, context) }
      : { ok: false, rejected: verdict.reason };
  } catch {
    return { ok: false, rejected: 'call_failed' };
  }
}

/**
 * The crew's shared version, from facts alone: used when personal versions are off, and when a
 * recipient's own version failed every retry.
 */
export function sharedVersion(context: VersionContext): VersionReply {
  const lead = context.items.find((item) => item.must_do) ?? context.items[0];
  const picks = context.items.slice(0, 3);
  return {
    slides: [
      {
        headline: context.destination,
        body:
          context.dates === null ? 'The plan is ready.' : `The plan is ready: ${context.dates}.`,
        item_id: null,
      },
      ...picks.map((item) => ({
        headline: item.title.slice(0, 60),
        body: item.day === null ? 'On the plan.' : `Day ${item.day}.`,
        item_id: item.id,
      })),
      {
        headline: 'Are you in?',
        body: context.share === null ? 'Tell the crew.' : `Your share: ${context.share}.`,
        item_id: null,
      },
    ].slice(0, 6),
    poster: { title: context.destination.slice(0, 60) },
    postcard: { message: `${context.destination}, together. Are you in?` },
    highlights: picks.map((item) => ({
      item_id: item.id,
      reason_tag: item.must_do ? ('your_must_do' as const) : ('crew_favourite' as const),
    })),
    savings: [],
    lead_item_id: lead?.id ?? '',
  };
}
