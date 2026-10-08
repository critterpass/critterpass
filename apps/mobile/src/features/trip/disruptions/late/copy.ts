/**
 * The running-late screen's words (3k-9), read in the active language at render. An option's line
 * is the guide's own when the app reads the guide's language; in any other it is built here from
 * the option's facts, so every time and amount is still the planner's.
 */
import { format, upper } from '@cp/i18n';
import type { LateOption } from '@cp/domain';
import { t } from '@lingui/core/macro';

import type { VendorStatus } from './model';

/* eslint-disable lingui/no-unlocalized-strings -- fact keys, never copy. */
const WALK_MIN = 'walk_min';
const ARRIVE = 'arrive';
/* eslint-enable lingui/no-unlocalized-strings */

const fact = (option: LateOption, key: string): string => {
  const value = option.facts[key];
  return value === undefined ? '' : String(value);
};

export function lateTitle(minutes: number, locale: string): string {
  return upper(
    t({ id: 'trip.disruptions.late.title', message: `Running ${minutes} min late` }),
    locale,
  );
}

export function waitingTitle(names: readonly string[], minutes: number, locale: string): string {
  const who = format.list(locale, [...names], { type: 'conjunction' });
  return upper(
    t({ id: 'trip.disruptions.late.waitingTitle', message: `${who}: ${minutes} min late` }),
    locale,
  );
}

export function waitingLine(title: string, start: string): string {
  return t({
    id: 'trip.disruptions.late.waitingLine',
    message: `${title} starts ${start} for you.`,
  });
}

export function eyebrow(title: string, start: string, locale: string): string {
  return upper(`${title} · ${start}`, locale);
}

export function lateChip(minutes: number, locale: string): string {
  return upper(t({ id: 'trip.disruptions.late.chip', message: `+${minutes} min` }), locale);
}

export function etaPill(eta: string, stale: boolean, locale: string): string {
  return upper(
    stale
      ? t({ id: 'trip.disruptions.late.etaStale', message: `Last ETA ${eta}` })
      : t({ id: 'trip.disruptions.late.eta', message: `ETA ${eta}` }),
    locale,
  );
}

export const backLabel = () => t({ id: 'trip.disruptions.late.back', message: 'Today' });

export function optionTitle(option: LateOption): string {
  switch (option.id) {
    case 'push':
      return t({ id: 'trip.disruptions.late.option.push', message: 'Push the slot' });
    case 'walk':
      return t({ id: 'trip.disruptions.late.option.walk', message: 'Walk the last bit' });
    case 'skip':
      return t({ id: 'trip.disruptions.late.option.skip', message: 'Skip it' });
    case 'car':
      return t({ id: 'trip.disruptions.late.option.car', message: 'Call a car' });
  }
}

function templateDetail(option: LateOption): string {
  const title = fact(option, 'title');
  const from = fact(option, 'from');
  const to = fact(option, 'to');
  switch (option.id) {
    case 'push':
      return option.split
        ? t({
            id: 'trip.disruptions.late.detail.split',
            message: `The others start at ${from}. You slot in at ${to}.`,
          })
        : t({ id: 'trip.disruptions.late.detail.push', message: `${title} moves to ${to}.` });
    case 'walk': {
      const minutes = fact(option, WALK_MIN);
      const arrive = fact(option, ARRIVE);
      return t({
        id: 'trip.disruptions.late.detail.walk',
        message: `${minutes} min on foot from here. There about ${arrive}.`,
      });
    }
    case 'skip':
      return t({
        id: 'trip.disruptions.late.detail.skip',
        message: `${title} goes on without you.`,
      });
    case 'car':
      return t({
        id: 'trip.disruptions.late.detail.car',
        message: 'Fare and pickup time from Grab.',
      });
  }
}

/** The guide's words in its own language; the facts' template in any other. */
export function optionDetail(option: LateOption, locale: string): string {
  const own = locale.split(/[-_]/u)[0] === 'en';
  return own && option.detail !== '' ? option.detail : templateDetail(option);
}

export function vendorChip(name: string, status: VendorStatus, locale: string): string {
  const line =
    status === 'agreed'
      ? t({ id: 'trip.disruptions.late.vendor.agreed', message: `${name} said yes` })
      : status === 'asked'
        ? t({ id: 'trip.disruptions.late.vendor.asked', message: `Asked ${name}` })
        : status === 'declined'
          ? t({ id: 'trip.disruptions.late.vendor.declined', message: `${name} said no` })
          : t({ id: 'trip.disruptions.late.vendor.ask', message: `Ask ${name}` });
  return upper(line, locale);
}

export function ctaLabel(option: LateOption | null): string {
  if (option === null) return t({ id: 'trip.disruptions.late.cta.none', message: 'Pick one' });
  const to = fact(option, 'to');
  switch (option.id) {
    case 'push':
      return to === ''
        ? optionTitle(option)
        : t({ id: 'trip.disruptions.late.cta.push', message: `Push to ${to}` });
    case 'walk':
    case 'skip':
    case 'car':
      return optionTitle(option);
  }
}

export const lateLines = () => ({
  told: t({ id: 'trip.disruptions.late.told', message: "Told whoever's waiting." }),
  chosen: t({ id: 'trip.disruptions.late.chosen', message: 'Sent' }),
  queued: t({
    id: 'trip.disruptions.late.queued',
    message: 'Saved. It sends when you have signal.',
  }),
  onTime: t({ id: 'trip.disruptions.late.onTime', message: "You're on time again." }),
  offlineMap: t({
    id: 'trip.disruptions.late.offlineMap',
    message: "No map offline. Your pick goes out when you're back.",
  }),
  missingTitle: t({ id: 'trip.disruptions.late.missingTitle', message: 'All sorted' }),
  missing: t({ id: 'trip.disruptions.late.missing', message: 'Nothing to sort here any more.' }),
  backAction: t({ id: 'trip.disruptions.late.backAction', message: 'Back' }),
});

/** The lines of a lateness the traveller said herself, before the day is changed. */
export const saidLateLines = () => ({
  /** Under the title: nothing has moved yet. */
  pick: t({
    id: 'trip.disruptions.late.said.pick',
    message: 'Nothing has changed yet. Pick what to do.',
  }),
  skip: t({
    id: 'trip.disruptions.late.said.skip',
    message: 'Just for you. It stays on the plan.',
  }),
  skipped: t({ id: 'trip.disruptions.late.said.skipped', message: 'Skipped, just for you' }),
  failed: t({
    id: 'trip.disruptions.late.said.failed',
    message: 'That didn’t change anything. Try again.',
  }),
  told: t({
    id: 'trip.disruptions.late.said.told',
    message: 'Your crew has been told. What you can do about it shows here in a moment.',
  }),
});

/** "Chợ Hàn moves to 14:30. 2 later stops move by 30 min." */
export function saidPushDetail(title: string, to: string, effect: string | null): string {
  const moves = t({ id: 'trip.disruptions.late.detail.push', message: `${title} moves to ${to}.` });
  return effect === null ? moves : `${moves} ${effect}`;
}
