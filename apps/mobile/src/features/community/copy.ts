/**
 * Words for crew plans built from the plan's numbers: its display title (the plan's own, or the
 * destination and its top tags in the reader's language), the crew line ("A crew of 4 · 8 days ·
 * April 2026") and the per-person cost.
 */
import { isTasteTag, type SharedPlanCard } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';

import { formatAmountShown } from '@/features/money/format';
import { tagWords } from '@/features/onboarding/taste/tag-labels';

export function tagLabel(tag: string): string {
  return isTasteTag(tag) ? tagWords(tag).short : tag;
}

export function planTitle(card: Pick<SharedPlanCard, 'title' | 'destination_name' | 'tags'>) {
  if (card.title !== null && card.title.trim() !== '') return card.title;
  const words = card.tags.filter(isTasteTag).slice(0, 2).map(tagLabel);
  const place = card.destination_name;
  if (words.length === 0) return place;
  const what = words.join(' & ');
  return t({ id: 'community.title.generated', message: `${place}: ${what}` });
}

export function travelMonth(
  card: Pick<SharedPlanCard, 'travel_month' | 'travel_year'>,
  locale: string,
) {
  if (card.travel_month === null || card.travel_year === null) return null;
  const date = new Date(Date.UTC(card.travel_year, card.travel_month - 1, 1));
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function crewName(card: Pick<SharedPlanCard, 'crew_names' | 'crew_size'>) {
  const names = card.crew_names;
  if (names !== null && names.length > 0) {
    const first = names[0] ?? '';
    const others = names.length - 1;
    return others === 0
      ? first
      : t({
          id: 'community.crew.named',
          message: plural(others, {
            one: `${first} and one friend`,
            other: `${first} and # friends`,
          }),
        });
  }
  const size = card.crew_size;
  return size <= 1
    ? t({ id: 'community.crew.solo', message: 'A solo traveller' })
    : t({ id: 'community.crew.size', message: `A crew of ${size}` });
}

export function daysLabel(days: number) {
  return t({ id: 'community.days', message: plural(days, { one: '# day', other: '# days' }) });
}

/** "A crew of 4 · 8 days · April 2026". */
export function crewLine(card: SharedPlanCard, locale: string) {
  const parts = [crewName(card), daysLabel(card.days_count)];
  const month = travelMonth(card, locale);
  if (month !== null) parts.push(month);
  return parts.join(' · ');
}

export function costEach(
  card: Pick<SharedPlanCard, 'cost_pp_rounded_minor' | 'currency'>,
  locale: string,
) {
  if (card.cost_pp_rounded_minor === null || card.currency === null) return null;
  const amount = formatAmountShown(BigInt(card.cost_pp_rounded_minor), card.currency, locale);
  return t({ id: 'community.cost.each', message: `${amount} each` });
}

/** ★ 4.8 once three crews rated it, else NEW. */
export function ratingLabel(card: Pick<SharedPlanCard, 'rating_avg' | 'rating_count'>) {
  if (card.rating_avg === null || card.rating_count < 3) {
    return t({ id: 'community.rating.new', message: 'New' });
  }
  return `★ ${card.rating_avg.toFixed(1)}`;
}

export function matchLabel(pct: number) {
  return t({ id: 'community.match', message: `${pct}% your taste` });
}

export function copiesLabel(count: number) {
  return t({
    id: 'community.copies',
    message: plural(count, { one: '# copy', other: '# copies' }),
  });
}
