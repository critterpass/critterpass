/**
 * The one place a link between two areas is worded: its length ("3 h 30", "45 min"), its mode in
 * one short word, and the travel line of a day trip ("about 3 h 30 by train each way"). Every
 * figure is door to door and an estimate, so every line says "about" and none promises a time.
 */
import type { AreaLinkMode } from '@cp/domain';
import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';

import type { AreaLink } from './area-links';

/** A figure in the reader's own digits and grouping. */
const figure = (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(i18n.locale, options).format(value);

export interface TravelLength {
  readonly hours: number;
  /** Minutes past the hour, 0–59. */
  readonly minutes: number;
}

export function travelLength(minutes: number): TravelLength {
  const whole = Math.max(0, Math.round(minutes));
  return { hours: Math.floor(whole / 60), minutes: whole % 60 };
}

/** "3 h 30", "10 h", "45 min", in the reader's digits. */
export function travelLengthLabel(minutes: number): string {
  const length = travelLength(minutes);
  const hours = figure(length.hours);
  if (length.hours === 0) {
    const mins = figure(length.minutes);
    return t({ id: 'explore.dayTrips.length.minutes', message: `${mins} min` });
  }
  if (length.minutes === 0)
    return t({ id: 'explore.dayTrips.length.hours', message: `${hours} h` });
  const rest = figure(length.minutes, { minimumIntegerDigits: 2 });
  return t({ id: 'explore.dayTrips.length.hoursMinutes', message: `${hours} h ${rest}` });
}

export function travelModeWord(mode: AreaLinkMode): string {
  switch (mode) {
    case 'train':
      return t({ id: 'explore.dayTrips.mode.train', message: 'Train' });
    case 'bus':
      return t({ id: 'explore.dayTrips.mode.bus', message: 'Bus' });
    case 'car':
      return t({ id: 'explore.dayTrips.mode.car', message: 'Car' });
    case 'boat':
      return t({ id: 'explore.dayTrips.mode.boat', message: 'Boat' });
    case 'flight':
      return t({ id: 'explore.dayTrips.mode.flight', message: 'Flight' });
    case 'tour':
      return t({ id: 'explore.dayTrips.mode.tour', message: 'Tour' });
  }
}

/** "about 3 h 30 by train each way": a day trip's way there, and back the same day. */
export function travelLine(link: Pick<AreaLink, 'minutes' | 'mode'>): string {
  const length = travelLengthLabel(link.minutes);
  switch (link.mode) {
    case 'train':
      return t({
        id: 'explore.dayTrips.travel.train',
        message: `about ${length} by train each way`,
      });
    case 'bus':
      return t({ id: 'explore.dayTrips.travel.bus', message: `about ${length} by bus each way` });
    case 'car':
      return t({ id: 'explore.dayTrips.travel.car', message: `about ${length} by car each way` });
    case 'boat':
      return t({
        id: 'explore.dayTrips.travel.boat',
        message: `about ${length} by boat each way`,
      });
    case 'flight':
      return t({
        id: 'explore.dayTrips.travel.flight',
        message: `about ${length} by plane each way`,
      });
    case 'tour':
      return t({
        id: 'explore.dayTrips.travel.tour',
        message: `about ${length} on a tour each way`,
      });
  }
}

/** "Train · about 3 h 30": one leg of a day trip, between the stay and the area. */
export function travelLegLabel(link: Pick<AreaLink, 'minutes' | 'mode'>): string {
  const mode = travelModeWord(link.mode);
  const length = travelLengthLabel(link.minutes);
  return t({ id: 'explore.dayTrips.travel.leg', message: `${mode} · about ${length}` });
}
