/**
 * The words of day trips in Explore: the section on Explore in a trip, the area's page, the day
 * picker with its warnings, what the server answered and why it refused. The area's name comes
 * from its row and is never translated here.
 */
import type { DayTripLength } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';

import type { DayAreaRefusal } from '@/data/areas/commands';

export const sectionTitle = (city: string) =>
  t({ id: 'explore.dayTrips.title', message: `Day trips from ${city}` });

export const lengthTag = (length: DayTripLength) =>
  length === 'half'
    ? t({ id: 'explore.dayTrips.halfDay', message: 'Half day' })
    : t({ id: 'explore.dayTrips.fullDay', message: 'Full day' });

export const onDayTag = (dayNo: number) =>
  t({ id: 'explore.dayTrips.onDay', message: `Day ${dayNo}` });

export const backLabel = () => t({ id: 'explore.dayTrips.back', message: 'Explore' });

export const tagline = (city: string) =>
  t({ id: 'explore.dayTrips.tagline', message: `A day out from ${city}, back by night.` });

/** "about $140 each": the link's typical cost, already formatted as an estimate. */
export const costLine = (amount: string) =>
  t({ id: 'explore.dayTrips.cost', message: `about ${amount} each` });

export const sourcesLine = () =>
  t({ id: 'explore.dayTrips.estimate', message: 'Times and prices are estimates.' });

export const placesTitle = (area: string) =>
  t({ id: 'explore.dayTrips.places', message: `What's at ${area}` });

export const placesComing = (guide: string) =>
  t({
    id: 'explore.dayTrips.placesComing',
    message: `${guide} is still gathering the places here. You can add the day now and fill it once they land.`,
  });

export const addAsDayTrip = () => t({ id: 'explore.dayTrips.add', message: 'Add as a day trip' });

export const changeDay = () => t({ id: 'explore.dayTrips.changeDay', message: 'Change day' });

export const remove = () => t({ id: 'explore.dayTrips.remove', message: 'Remove' });

export const onDayLine = (dayNo: number, date: string | null) =>
  date === null
    ? t({ id: 'explore.dayTrips.onDayLine', message: `It's on day ${dayNo} of the plan.` })
    : t({ id: 'explore.dayTrips.onDateLine', message: `It's on day ${dayNo}, ${date}.` });

export const askOrganiser = (organiser: string | null) =>
  organiser === null
    ? t({ id: 'explore.dayTrips.askAnyone', message: 'Ask the organiser to add it' })
    : t({ id: 'explore.dayTrips.ask', message: `Ask ${organiser} to add it` });

export const offlineLine = () =>
  t({
    id: 'explore.dayTrips.offline',
    message: "You're offline. Adding a day trip needs a connection.",
  });

export const draftingLine = (guide: string) =>
  t({
    id: 'explore.dayTrips.drafting',
    message: `${guide} is writing the plan. Add the day trip once the draft is in.`,
  });

export const noPlanLine = () =>
  t({
    id: 'explore.dayTrips.noPlan',
    message: 'Lock the dates first: a day trip takes one of the plan’s days.',
  });

export const closedLine = () =>
  t({
    id: 'explore.dayTrips.closed',
    message: 'This trip is over, so its plan no longer changes.',
  });

export const pickerTitle = (area: string) =>
  t({ id: 'explore.dayTrips.pickerTitle', message: `Which day for ${area}?` });

export const edgeDayLine = (first: boolean) =>
  first
    ? t({
        id: 'explore.dayTrips.firstDay',
        message: 'You arrive this day: a day trip leaves little of it.',
      })
    : t({
        id: 'explore.dayTrips.lastDay',
        message: 'You leave this day: a day trip leaves little of it.',
      });

export const bookedLine = () =>
  t({
    id: 'explore.dayTrips.booked',
    message: 'This day holds a booking. It stays on the day.',
  });

export const otherTripLine = (area: string) =>
  t({ id: 'explore.dayTrips.otherTrip', message: `This day is already at ${area}.` });

export const movesLine = (count: number) =>
  count === 0
    ? t({ id: 'explore.dayTrips.movesNone', message: 'The day is free: nothing moves.' })
    : t({
        id: 'explore.dayTrips.moves',
        message: plural(count, {
          one: '# stop goes back to Ideas',
          other: '# stops go back to Ideas',
        }),
      });

export const confirmAdd = (dayNo: number) =>
  t({ id: 'explore.dayTrips.confirm', message: `Add to day ${dayNo}` });

export const pickDayHint = () => t({ id: 'explore.dayTrips.pickDay', message: 'Pick a day' });

export const addedToast = (area: string, dayNo: number) =>
  t({ id: 'explore.dayTrips.added', message: `Day ${dayNo} is at ${area}` });

export const movedToast = (names: string) =>
  t({ id: 'explore.dayTrips.moved', message: `Back in Ideas: ${names}` });

export const removedToast = (dayNo: number, city: string) =>
  t({ id: 'explore.dayTrips.removed', message: `Day ${dayNo} is back in ${city}` });

export const removeTitle = (area: string) =>
  t({ id: 'explore.dayTrips.removeTitle', message: `Take ${area} off the plan?` });

export const removeBackLine = (dayNo: number, city: string) =>
  t({ id: 'explore.dayTrips.removeBack', message: `Day ${dayNo} goes back to ${city}.` });

export const removeConfirm = () =>
  t({ id: 'explore.dayTrips.removeConfirm', message: 'Remove the day trip' });

/** Why the server refused, in plain words: never its raw message. */
export function refusalLine(refusal: DayAreaRefusal, guide: string): string {
  switch (refusal) {
    case 'not_a_day_trip':
      return t({
        id: 'explore.dayTrips.refused.notADayTrip',
        message: "That place isn't a day trip from here any more.",
      });
    case 'other_time_zone':
      return t({
        id: 'explore.dayTrips.refused.timeZone',
        message: "It's in another time zone, which a day trip can't cross yet.",
      });
    case 'other_currency':
      return t({
        id: 'explore.dayTrips.refused.currency',
        message: "It uses another currency, which a day trip can't cross yet.",
      });
    case 'draft_running':
      return draftingLine(guide);
    case 'plan_changed':
      return t({
        id: 'explore.dayTrips.refused.planChanged',
        message: 'The plan changed while you were choosing. Have another look and try again.',
      });
    case 'offline':
      return offlineLine();
    case 'other':
      return t({
        id: 'explore.dayTrips.refused.other',
        message: "That didn't go through. Try again in a moment.",
      });
  }
}
