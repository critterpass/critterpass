/* eslint-disable lingui/no-unlocalized-strings -- locale tags, tone names and separators, not UI copy. */
/**
 * What a published crew plan shows on the web, from its public projection alone: the words of the
 * ticket and the share card, and each day as a row. Pure functions, so the page, the card and
 * their tests agree, and neither can say more than the projection carries.
 */
import type { PublicPlan } from '@cp/domain';

import { planCopy as copy } from '../site/copy/plan';
import type { Translate } from '../site/i18n';

export interface PlanWords {
  readonly eyebrow: string;
  readonly headline: string;
  /** "Planned by Maya, Arjun and Jess", only when the crew published names. */
  readonly byline: string | null;
  /** Length, month, crew size and whether the trip happened. */
  readonly chips: readonly string[];
  /** Copies and ratings, when there are any. */
  readonly proof: readonly string[];
  readonly pageTitle: string;
  readonly pageDescription: string;
}

function travelMonth(plan: PublicPlan, locale: string): string | null {
  if (plan.travel_month === null) return null;
  const date = new Date(Date.UTC(plan.travel_year ?? 2000, plan.travel_month - 1, 1));
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    ...(plan.travel_year === null ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(date);
}

export function planWords(plan: PublicPlan, t: Translate, locale = 'en'): PlanWords {
  const place = plan.destination_name;
  const days = plan.days_count;
  const headline = plan.title ?? t(copy.headline, { days, place });
  const names = plan.crew_names ?? [];
  const chips = [
    t(copy.days, { days }),
    travelMonth(plan, locale),
    plan.crew_size > 1 ? t(copy.crewOf, { size: plan.crew_size }) : t(copy.solo),
    plan.travelled ? t(copy.travelled) : t(copy.planned),
  ].filter((chip): chip is string => chip !== null);
  const proof = [
    plan.rating_avg !== null && plan.rating_count > 0
      ? t(copy.rating, {
          average: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
            plan.rating_avg,
          ),
          count: plan.rating_count,
        })
      : null,
    plan.copies_count > 0 ? t(copy.copies, { count: plan.copies_count }) : null,
  ].filter((entry): entry is string => entry !== null);
  return {
    eyebrow: t(copy.eyebrow, { place }),
    headline,
    byline:
      names.length > 0
        ? t(copy.plannedBy, {
            names: new Intl.ListFormat(locale, { type: 'conjunction' }).format(names),
          })
        : null,
    chips,
    proof,
    pageTitle: t(copy.pageTitle, { headline }),
    pageDescription: t(copy.pageDescription, { days, place }),
  };
}

const DAY_TONES = ['green', 'orange', 'blue'] as const;

export interface PlanDayRow {
  readonly dayNo: number;
  /** The day's theme, else its first place; null for a day with nothing fixed. */
  readonly title: string | null;
  /** The places after the one used as the title. */
  readonly line: string | null;
  readonly tone: (typeof DAY_TONES)[number];
}

export function planDayRows(plan: PublicPlan): readonly PlanDayRow[] {
  return plan.days.map((day, index) => {
    const names = day.places.map((place) => place.name);
    const rest = day.theme === null ? names.slice(1) : names;
    return {
      dayNo: day.day_no,
      title: day.theme ?? names[0] ?? null,
      line: rest.length > 0 ? rest.join(' · ') : null,
      tone: DAY_TONES[index % DAY_TONES.length] ?? 'green',
    };
  });
}

/** The in-app screen of a published plan, as an `/app/…` link path: where "Copy into my trip" goes. */
export function planAppPath(plan: PublicPlan): string {
  return `/app/community/plan/${plan.shared_plan_id}`;
}
