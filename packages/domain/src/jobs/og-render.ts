/**
 * `og.render` (docs/api-contracts-async.md §2.2): asks the web Worker for a share card so it is
 * drawn and cached before anyone unfurls the link, or so a revoked, rotated or expired code's cached
 * card is deleted now instead of on its next request. The web route decides which from the code's
 * live state; the job only names the card. The code travels as `token` so the jobs panel shows no
 * more than its last characters.
 */
import { z } from 'zod';

import { isJoinCode } from '../links/codes';

export const OG_RENDER_QUEUE = 'og.render';

/** The private card kinds keyed by a link code (`/og/{kind}/{code}.png`). */
export const OG_RENDER_KINDS = ['invite', 'referral'] as const;
export type OgRenderKind = (typeof OG_RENDER_KINDS)[number];

export const ogRenderJobSchema = z.object({
  kind: z.enum(OG_RENDER_KINDS),
  token: z.string().refine(isJoinCode, 'not a join code'),
});
export type OgRenderJob = z.infer<typeof ogRenderJobSchema>;

/** One queued and one running refresh per card: a burst of changes collapses into one redraw. */
export function ogRenderSingletonKey(job: OgRenderJob): string {
  return `${job.kind}:${job.token}`;
}

/** The web path the job requests for a card. */
export function ogCardPath(job: OgRenderJob): string {
  return `/og/${job.kind}/${job.token}.png`;
}
