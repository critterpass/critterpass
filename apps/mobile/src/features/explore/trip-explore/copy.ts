/**
 * The words of Explore in a trip (7g-1): the hero's saved count, the docked search, the gaps card,
 * the picks' states and the swipe card.
 */
import { plural, t } from '@lingui/core/macro';

import { weekdayOfDate } from '../search/weekday-names';
import type { SwipeLive } from './trip-explore-model';

export const backLabel = () => t({ id: 'explore.trip.back', message: 'Trip' });

export const savedCount = (count: number) =>
  t({ id: 'explore.trip.savedCount', message: `♡ ${count} saved` });

export const savedCountLabel = (count: number) =>
  t({
    id: 'explore.trip.savedCountLabel',
    message: plural(count, {
      one: 'Ideas: # place saved for this trip',
      other: 'Ideas: # places saved for this trip',
    }),
  });

export const searchPlaceholder = (destination: string, guide: string) =>
  t({ id: 'explore.trip.search', message: `Search ${destination}, or ask ${guide}` });

export const gapsTitle = () => t({ id: 'explore.trip.gapsTitle', message: 'For your gaps' });

export const gapsBy = (guide: string) => t({ id: 'explore.trip.gapsBy', message: `By ${guide}` });

export const fillIt = () => t({ id: 'explore.trip.fillIt', message: 'Fill it' });

/** "WED 16:00–19:00" before casing: the weekday from the app's own catalogue. */
export function gapWhen(date: string, from: string, to: string): string {
  const weekday = weekdayOfDate(date) ?? '';
  return t({ id: 'explore.trip.gapWhen', message: `${weekday} ${from}–${to}` });
}

/** Who is free in the window, and what the others are doing meanwhile when it has a name. */
export function gapWho(count: number, everyone: boolean, busy: string | null): string {
  if (count === 1) return t({ id: 'explore.trip.gapSolo', message: "You're free" });
  if (everyone) return t({ id: 'explore.trip.gapEveryone', message: 'The whole crew is free' });
  if (busy === null) {
    return t({
      id: 'explore.trip.gapFree',
      message: plural(count, {
        2: 'Two of you are free',
        3: 'Three of you are free',
        4: 'Four of you are free',
        5: 'Five of you are free',
        other: '# of you are free',
      }),
    });
  }
  return t({
    id: 'explore.trip.gapFreeWhile',
    message: plural(count, {
      2: `Two of you are free while ${busy} runs`,
      3: `Three of you are free while ${busy} runs`,
      4: `Four of you are free while ${busy} runs`,
      5: `Five of you are free while ${busy} runs`,
      other: `# of you are free while ${busy} runs`,
    }),
  });
}

export const gapsFullTitle = () =>
  t({ id: 'explore.trip.gapsFullTitle', message: 'Your days are full' });

export const gapsFullLine = () =>
  t({
    id: 'explore.trip.gapsFullLine',
    message: 'No free window of an hour or more is left. Free one up and ideas for it land here.',
  });

export const gapsEmptyTitle = () =>
  t({ id: 'explore.trip.gapsEmptyTitle', message: 'Nothing planned yet' });

export const gapsEmptyLine = (guide: string) =>
  t({
    id: 'explore.trip.gapsEmptyLine',
    message: `Once the plan has its days, ${guide} finds the free windows and fills them here.`,
  });

export const stayIdea = () => t({ id: 'explore.trip.stayIdea', message: 'Back at the stay' });

export const pairIdea = (first: string, second: string) =>
  t({ id: 'explore.trip.pairIdea', message: `${first} + ${second}` });

export const picksTitle = (guide: string) =>
  t({ id: 'explore.trip.picksTitle', message: `${guide}'s first-timer picks` });

export const kindsTitle = () => t({ id: 'explore.trip.kindsTitle', message: 'Browse by kind' });

export const kindLabel = (kind: string, count: string) =>
  t({ id: 'explore.trip.kindLabel', message: `${kind} · ${count}` });

export const picksAll = (count: string) =>
  t({ id: 'explore.trip.picksAll', message: `${count} ›` });

export const pickSaved = () => t({ id: 'explore.trip.pickSaved', message: '♥ Saved' });

export const pickInDay = (day: number) =>
  t({ id: 'explore.trip.pickInDay', message: `In day ${day}` });

export const pickAddLabel = (place: string) =>
  t({ id: 'explore.trip.pickAdd', message: `Save ${place} to Ideas` });

export const pickSavedToast = (place: string) =>
  t({ id: 'explore.trip.pickSavedToast', message: `${place} is in Ideas.` });

export const swipeTitle = () => t({ id: 'explore.trip.swipeTitle', message: 'Swipe together' });

export const swipeBody = (count: number) =>
  t({
    id: 'explore.trip.swipeBody',
    message: `Can't agree? ${count} places, everyone swipes, matches go to Ideas.`,
  });

export function swipePill(live: SwipeLive): string {
  return live.kind === 'start'
    ? t({ id: 'explore.trip.swipeStart', message: 'Start' })
    : t({ id: 'explore.trip.swipeJoin', message: 'Join' });
}
