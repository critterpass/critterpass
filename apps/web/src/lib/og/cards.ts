/**
 * From a link's public preview to the card drawn for it: the same words the landing page uses
 * (handoff-copy) and the same facts (invite-facts), so a card never says more than the page.
 */
import type { LinkPreview, LinkTarget, PublicPlan } from '@cp/domain';
import type { Node } from '@takumi-rs/helpers';

import { estimateEach, guideKind, tripDates } from '../../components/previews/invite-facts';
import { handoffCopy } from '../links/handoff-copy';
import { inviteTemplate } from './templates/invite';
import { localsTemplate } from './templates/locals';
import { planTemplate } from './templates/plan';
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
  /** The plan card's words, from the same facts as the plan page. */
  readonly plan: (plan: PublicPlan) => {
    readonly eyebrow: string;
    readonly headline: string;
    readonly chips: readonly string[];
  };
}

/** A published crew plan's card: where, how long and the crew's size; never names or places. */
export function planCard(plan: PublicPlan, words: CardWords): DrawnCard {
  const { eyebrow, headline, chips } = words.plan(plan);
  const content = { eyebrow, headline, chips: chips.slice(0, 3), guide: 'gecko' };
  return { node: planTemplate(content), stickers: [content.guide], content };
}

/** The words of a place's locals card, from the same facts as its page. */
export interface LocalsCardWords {
  readonly eyebrow: string;
  readonly headline: string;
  readonly count: string;
  readonly chips: readonly string[];
}

/** A place's locals card: the place and how many critters of each tier; never a critter. */
export function localsCard(words: LocalsCardWords): DrawnCard {
  const content = {
    eyebrow: words.eyebrow,
    headline: words.headline,
    count: words.count,
    chips: words.chips.slice(0, 4),
    guide: 'gecko',
  };
  return { node: localsTemplate(content), stickers: [content.guide], content };
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
