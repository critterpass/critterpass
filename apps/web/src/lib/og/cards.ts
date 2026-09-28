/**
 * From a link's public preview to the card drawn for it: the same words the landing page uses
 * (handoff-copy) and the same facts (invite-facts), so a card never says more than the page.
 */
import type { LinkPreview, LinkTarget } from '@cp/domain';
import type { Node } from '@takumi-rs/helpers';

import { estimateEach, guideKind, tripDates } from '../../components/previews/invite-facts';
import { handoffCopy } from '../links/handoff-copy';
import { inviteTemplate } from './templates/invite';
import { referralTemplate } from './templates/referral';

export interface DrawnCard {
  readonly node: Node;
  /** Critter kinds whose baked stickers the card uses. */
  readonly stickers: readonly string[];
  /** Everything the card shows, for the cache digest. */
  readonly content: unknown;
}

export interface CardWords {
  readonly referralTitle: string;
  readonly referralEyebrow: (name: string | null) => string;
  readonly referralBody: (name: string | null) => string;
  readonly estimateEach: (amount: string) => string;
}

export function linkCard(
  target: LinkTarget,
  code: string,
  preview: LinkPreview,
  words: CardWords,
): DrawnCard {
  const copy = handoffCopy(target, preview);
  const guide = guideKind(preview.guide_slug);
  if (preview.kind === 'referral') {
    const content = {
      eyebrow: words.referralEyebrow(preview.inviter_first_name),
      headline: words.referralTitle,
      body: words.referralBody(preview.inviter_first_name),
      guide,
    };
    return { node: referralTemplate(content), stickers: [guide], content };
  }
  const estimate = estimateEach(preview);
  const chips = [
    tripDates(preview),
    estimate === null ? null : words.estimateEach(estimate),
    preview.crew_name,
  ].filter((chip): chip is string => chip !== null);
  const content = { eyebrow: copy.eyebrow, headline: copy.headline, chips, code, guide };
  return { node: inviteTemplate(content), stickers: [guide], content };
}
