/**
 * The words on the drafting screen's rows. A finished step says what it actually found (its label
 * key and numbers from the job); a step still to come or under way says what it is doing. No row
 * ever claims a hold, a price or free cancellation: the job's labels carry none of those.
 */
import type { DraftStepLabel } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';

import type { DayCard, StepRow } from '../data/job';

function text(params: DraftStepLabel['params'], key: string): string {
  const value = params[key];
  return value === undefined ? '' : String(value);
}

function count(params: DraftStepLabel['params'], key: string): number {
  const value = params[key];
  return typeof value === 'number' ? value : Number(value ?? 0) || 0;
}

/** What a finished step found. */
export function labelLine(label: DraftStepLabel): string {
  const p = label.params;
  switch (label.key) {
    case 'read_profiles': {
      const n = count(p, 'n');
      return t({
        id: 'planDraft.step.readProfiles',
        message: plural(n, { one: 'Read one taste profile', other: 'Read # taste profiles' }),
      });
    }
    case 'season': {
      const signal = text(p, 'signal');
      return t({ id: 'planDraft.step.season', message: `Checked the ${signal}` });
    }
    case 'season_none':
      return t({ id: 'planDraft.step.seasonNone', message: 'Checked the season' });
    case 'stays': {
      const n = count(p, 'n');
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a label param key, never copy.
      const stayType = text(p, 'stay_type');
      const area = text(p, 'area');
      return t({
        id: 'planDraft.step.stays',
        message: plural(n, {
          one: `Picked a ${stayType} in ${area}`,
          other: `Picked # ${stayType} stays in ${area}`,
        }),
      });
    }
    case 'days_planned': {
      const n = count(p, 'n');
      return t({
        id: 'planDraft.step.daysPlanned',
        message: plural(n, { one: 'Planned one day', other: 'Planned # days' }),
      });
    }
    case 'balance': {
      const early = count(p, 'early');
      const late = count(p, 'late');
      return t({
        id: 'planDraft.step.balance',
        message: `Balancing ${early} early birds and ${late} night owls`,
      });
    }
    case 'pace':
      return t({ id: 'planDraft.step.pace', message: 'Setting the pace' });
    case 'food': {
      const dietary = text(p, 'dietary');
      const name = text(p, 'name');
      return t({ id: 'planDraft.step.food', message: `Finding ${dietary} food for ${name}` });
    }
    case 'hours':
      return t({ id: 'planDraft.step.hours', message: 'Checking opening hours' });
    case 'saved':
      return t({ id: 'planDraft.step.saved', message: 'Your draft is ready' });
  }
}

/** What a step is doing (or will do) before it has a result. */
export function workingLine(stepId: string): string {
  switch (stepId) {
    case 'read_profiles':
      return t({ id: 'planDraft.working.profiles', message: 'Reading taste profiles' });
    case 'check_season':
      return t({ id: 'planDraft.working.season', message: 'Checking the season' });
    case 'skeleton':
      return t({ id: 'planDraft.working.outline', message: 'Picking where you stay' });
    case 'days':
      return t({ id: 'planDraft.working.days', message: 'Balancing the days' });
    case 'validate':
      return t({ id: 'planDraft.working.check', message: 'Checking food and opening hours' });
    default:
      return t({ id: 'planDraft.working.saving', message: 'Saving your draft' });
  }
}

export function stepLine(row: StepRow): string {
  return row.label === null ? workingLine(row.id) : labelLine(row.label);
}

/** Why a step failed, in words (never the raw reason). */
export function failLine(reason: string | null): string {
  switch (reason) {
    case 'model_unavailable':
      return t({ id: 'planDraft.fail.model', message: 'I couldn’t reach my notes. Try again.' });
    case 'no_places':
      return t({
        id: 'planDraft.fail.places',
        message: 'I don’t know enough places there yet.',
      });
    case 'trip_not_ready':
      return t({ id: 'planDraft.fail.setup', message: 'Setup isn’t finished yet.' });
    case null:
    default:
      return t({ id: 'planDraft.fail.other', message: 'This step didn’t work out.' });
  }
}

/**
 * A day as it rolls past during the wait. The guide writes each day's title in English first and
 * its translations follow the draft, so only an English reader sees the title here; everyone else
 * sees the day and, once it is built, how many stops it has.
 */
export function dayCardLabel(day: DayCard, locale: string): string {
  const n = day.dayNo;
  if (locale.toLowerCase().startsWith('en')) {
    const theme = day.theme;
    return t({ id: 'planDraft.dayCard', message: `Day ${n} · ${theme}` });
  }
  const stops = day.stops;
  return stops === null
    ? t({ id: 'planDraft.dayCard.outlined', message: `Day ${n} · outlined` })
    : t({
        id: 'planDraft.dayCard.stops',
        message: plural(stops, { one: `Day ${n} · # stop`, other: `Day ${n} · # stops` }),
      });
}
