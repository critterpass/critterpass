/**
 * The placing screen's words (7h-6): the title, the four step lines (the days being routed by
 * name, what was left for the person), and the line at the foot for a run under way, with nothing
 * to place, or failed.
 */
import { plural, t } from '@lingui/core/macro';

import type { PlacingState } from './progress';

// eslint-disable-next-line lingui/no-unlocalized-strings -- a date suffix, never copy.
const MIDDAY = 'T12:00:00Z';

export function dayNames(
  dayNos: readonly number[],
  dates: ReadonlyMap<number, string>,
  locale: string,
) {
  const names = dayNos.flatMap((dayNo) => {
    const date = dates.get(dayNo);
    if (date === undefined) return [];
    const at = new Date(`${date}${MIDDAY}`);
    return [new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(at)];
  });
  if (names.length <= 1) return names[0] ?? '';
  const last = names[names.length - 1] ?? '';
  const first = names.slice(0, -1).join(', ');
  return t({ id: 'plan.placing.and', message: `${first} and ${last}` });
}

export function lineTexts(
  state: PlacingState,
  count: number,
  days: string,
): Record<string, string> {
  const left = state.left ?? [];
  const split = left.filter((idea) => idea.reason === 'split').length;
  const leftCount = left.length;
  return {
    hours: t({
      id: 'plan.placing.hours',
      message: plural(count, { one: 'Opening hours for it', other: 'Opening hours for all #' }),
    }),
    locks: t({ id: 'plan.placing.locks', message: 'Nothing booked moves' }),
    routing:
      days === ''
        ? t({ id: 'plan.placing.routingDays', message: 'Routing the days' })
        : t({ id: 'plan.placing.routing', message: `Routing ${days}` }),
    needs_you:
      state.left === null
        ? t({ id: 'plan.placing.needsYouPending', message: 'Leaving what needs you for you' })
        : left.length === 0
          ? t({ id: 'plan.placing.needsYouNone', message: 'Nothing left over' })
          : split === left.length && split === 1
            ? t({ id: 'plan.placing.needsYouSplit', message: 'Leaving the split one for you' })
            : t({
                id: 'plan.placing.needsYouSome',
                message: plural(leftCount, {
                  one: 'Leaving one for you',
                  other: 'Leaving # for you',
                }),
              }),
  };
}

export function placingTitle(count: number): string {
  return t({
    id: 'plan.placing.title',
    message: plural(count, { one: 'PLACING\n1 IDEA', other: 'PLACING\n# IDEAS' }),
  });
}

export function placingFoot(): string {
  return t({
    id: 'plan.placing.foot',
    message: 'About ten seconds. Leave if you like, Tokek will ping you.',
  });
}

export function nothingFoot(): string {
  return t({
    id: 'plan.placing.nothing',
    message: 'Nothing fits without moving something. What needs you is in Ideas.',
  });
}

export function failedFoot(): string {
  return t({ id: 'plan.placing.failed', message: 'Tokek couldn’t place them this time.' });
}
