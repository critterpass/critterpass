/**
 * The words on a destination's hero: what its guide says, and the facts as chips. Guides with a line of their own keep it; the rest
 * introduce themselves, a guide whose picks nobody has checked says it is still learning the place, and the guest guide owns up
 * to covering a place that is not home.
 */
import { plural, t } from '@lingui/core/macro';

import type { FlightFact } from './destination-model';
import { moneyText, monthName, type GuideFacts } from './format';

export function guideTagline(guide: GuideFacts, place: string): string {
  if (guide.guest) {
    return t({
      id: 'explore.guide.guestLine',
      message: "Not my island, but I've done my homework.",
    });
  }
  if (guide.learning) {
    return t({
      id: 'explore.guide.learningLine',
      message: `I'm still learning ${place}. Nobody has checked my picks here yet.`,
    });
  }
  if (guide.id === 'tokek') {
    return t({
      id: 'explore.guide.tokekLine',
      message: 'Slow mornings, early temples, late dinners.',
    });
  }
  if (guide.id === 'pon') {
    return t({ id: 'explore.guide.ponLine', message: 'Shoes off, phone down, eyes up.' });
  }
  if (guide.id === 'sardi') {
    return t({
      id: 'explore.guide.sardiLine',
      message: 'Come for the grilled sardines. Stay for the grilled sardines.',
    });
  }
  return t({ id: 'explore.guide.homeLine', message: `Your guide in ${place}.` });
}

export interface HeroFacts {
  readonly flight: FlightFact | null;
  /** Some of the place's money against the reader's own, in minor units. */
  readonly fx: {
    readonly from: { readonly amount_minor: number; readonly currency: string };
    readonly to: { readonly amount_minor: number; readonly currency: string };
  } | null;
  /** 1–12. */
  readonly best: readonly number[];
}

/** One fact on the hero; `nowrap` for a rate, which is short and must never be split or cut. */
export interface HeroChip {
  readonly text: string;
  readonly nowrap: boolean;
}

/** "7h from SIN", "¥1,000 ≈ $6.70", "Best: Apr · Nov": only the facts that are known. */
export function heroChips(locale: string, facts: HeroFacts): HeroChip[] {
  const chips: HeroChip[] = [];
  const fact = (text: string) => {
    chips.push({ text, nowrap: false });
  };
  if (facts.flight !== null) {
    const { origin, hours, transfers } = facts.flight;
    if (hours !== null) {
      fact(t({ id: 'explore.hero.hoursFrom', message: `${hours}h from ${origin}` }));
    } else if (transfers === 0) {
      fact(t({ id: 'explore.hero.directFrom', message: `Direct from ${origin}` }));
    } else if (transfers !== null) {
      fact(
        t({
          id: 'explore.hero.stopsFrom',
          message: plural(transfers, {
            one: `# stop from ${origin}`,
            other: `# stops from ${origin}`,
          }),
        }),
      );
    }
  }
  if (facts.fx !== null) {
    const from = moneyText(locale, facts.fx.from.amount_minor, facts.fx.from.currency);
    const to = moneyText(locale, facts.fx.to.amount_minor, facts.fx.to.currency);
    chips.push({ text: `${from} ≈ ${to}`, nowrap: true });
  }
  if (facts.best.length > 0) {
    const months = facts.best.map((month) => monthName(locale, month)).join(' · ');
    fact(t({ id: 'explore.hero.best', message: `Best: ${months}` }));
  }
  return chips;
}
