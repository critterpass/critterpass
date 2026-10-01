/**
 * Explore's small formatters: month names in the reader's language, money through the shared
 * formatter (never a bare `Intl` call), and the guide each destination belongs to.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values and token names, never copy. */
import { formatMoney, money } from '@cp/cost-engine';
import { tokens } from '@cp/design-tokens';
import { format } from '@cp/i18n';

import { GUIDE_STICKERS, isGuideStickerId, type GuideStickerId } from '@/ui/avatar/guides';

/** "Apr" (short), "April" (long) or "A" (narrow) for month 1–12. */
export function monthName(
  locale: string,
  month: number,
  width: 'short' | 'long' | 'narrow' = 'short',
): string {
  return format.date(locale, new Date(Date.UTC(2001, month - 1, 15, 12)), {
    month: width,
    timeZone: 'UTC',
  });
}

/** "$420" / "10.500.000 ₫": an amount in minor units, in the reader's locale. */
export function moneyText(locale: string, minor: number, currency: string): string {
  return formatMoney(money(BigInt(Math.round(minor)), currency), { locale, mode: 'local' });
}

/** The guest guide, who covers every place without a guide of its own. */
export const GUEST_GUIDE: GuideStickerId = 'tokek';

export interface GuideFacts {
  readonly id: GuideStickerId;
  readonly name: string;
  readonly kind: string;
  readonly colour: string;
  /** No guide lives here: the guest guide covers it. */
  readonly guest: boolean;
}

/** The guide of a destination from its catalogue slug; the guest guide when it has none. */
export function guideFor(slug: string | null | undefined): GuideFacts {
  const id: GuideStickerId = isGuideStickerId(slug) ? slug : GUEST_GUIDE;
  const sticker = GUIDE_STICKERS[id];
  return {
    id,
    name: sticker.name,
    kind: sticker.kind,
    colour: tokens.guide[id],
    guest: id !== slug,
  };
}
