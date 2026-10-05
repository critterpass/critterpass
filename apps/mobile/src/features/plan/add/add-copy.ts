/**
 * The Add to plan sheet's words (7f-1), built on the phone from the fit's reason codes so every
 * language reads the same answer: the WHY tiles ("Opens at 08:00", "Busy from 10", "45 min, a ride
 * works", "Dry mornings in Oct"), the line under the block ("New · quiet till about 10"), the leave
 * line from the stay, the day header and the button.
 */
/* eslint-disable lingui/no-unlocalized-strings -- reason codes, tile keys and icon names, never copy (every line is worded through `t`). */
import type { DayFit, FitReason } from '@cp/domain';
import { t } from '@lingui/core/macro';

import type { Reason } from '@/ui/planning';

import { clockOf } from './add-model';

type Of<C extends FitReason['code']> = Extract<FitReason, { code: C }>;

function find<C extends FitReason['code']>(
  reasons: readonly FitReason[],
  code: C,
): Of<C> | undefined {
  return reasons.find((entry): entry is Of<C> => entry.code === code);
}

/** "10" for 10:00, "10:30" otherwise: how the sheet says a crowd's hour. */
function hourText(time: string): string {
  return time.endsWith(':00') ? String(Number(time.slice(0, 2))) : time;
}

function travelTile(reasons: readonly FitReason[]): Reason | null {
  const drive = find(reasons, 'drive_minutes');
  const walk = find(reasons, 'walk_minutes');
  const ride = find(reasons, 'ride_works');
  if (drive !== undefined) {
    const minutes = String(drive.params.minutes);
    return {
      key: 'travel',
      icon: 'car',
      text:
        ride === undefined
          ? drive.params.approx
            ? t({ id: 'plan.add.why.driveAbout', message: `About ${minutes} min by car` })
            : t({ id: 'plan.add.why.drive', message: `${minutes} min by car` })
          : t({ id: 'plan.add.why.driveRide', message: `${minutes} min, a ride works` }),
    };
  }
  if (walk !== undefined) {
    const minutes = String(walk.params.minutes);
    return {
      key: 'travel',
      icon: 'pin',
      text: t({ id: 'plan.add.why.walk', message: `${minutes} min walk` }),
    };
  }
  return null;
}

function hoursTile(reasons: readonly FitReason[]): Reason | null {
  const opens = find(reasons, 'opens_at');
  if (opens !== undefined) {
    const time = opens.params.time;
    return {
      key: 'hours',
      icon: 'cal',
      text: t({ id: 'plan.add.why.opens', message: `Opens at ${time}` }),
    };
  }
  const closes = find(reasons, 'closes_at');
  if (closes !== undefined) {
    const time = closes.params.time;
    return {
      key: 'hours',
      icon: 'cal',
      text: t({ id: 'plan.add.why.closes', message: `Closes at ${time}` }),
    };
  }
  if (find(reasons, 'hours_unknown') !== undefined) {
    return {
      key: 'hours',
      icon: 'cal',
      text: t({ id: 'plan.add.why.hoursUnknown', message: 'Opening hours not known yet' }),
    };
  }
  return null;
}

function crowdTile(reasons: readonly FitReason[]): Reason | null {
  const busy = find(reasons, 'busy_from');
  if (busy !== undefined) {
    const hour = hourText(busy.params.time);
    return {
      key: 'crowd',
      icon: 'flame',
      text: t({ id: 'plan.add.why.busy', message: `Busy from ${hour}` }),
    };
  }
  const quiet = find(reasons, 'quiet_until');
  if (quiet !== undefined) {
    const hour = hourText(quiet.params.time);
    return {
      key: 'crowd',
      icon: 'flame',
      text: t({ id: 'plan.add.why.quiet', message: `Quiet till about ${hour}` }),
    };
  }
  return null;
}

function weatherTile(reasons: readonly FitReason[], month: string): Reason | null {
  const rain = find(reasons, 'rain_likely');
  if (rain !== undefined) {
    const { from, to } = rain.params;
    return {
      key: 'weather',
      icon: 'rain',
      text: t({ id: 'plan.add.why.rain', message: `Rain likely ${from}–${to}` }),
    };
  }
  const dry = find(reasons, 'dry_window');
  if (dry !== undefined) {
    const { from, to } = dry.params;
    return {
      key: 'weather',
      icon: 'sun',
      text: t({ id: 'plan.add.why.dry', message: `Dry ${from}–${to}` }),
    };
  }
  if (find(reasons, 'dry_mornings') !== undefined) {
    return {
      key: 'weather',
      icon: 'sun',
      text: t({ id: 'plan.add.why.dryMornings', message: `Dry mornings in ${month}` }),
    };
  }
  return null;
}

type StopName = (stableId: string) => string | null;

/** "After Lokal Bar", "Before dinner", or both: what the block sits between. */
function aroundTile(reasons: readonly FitReason[], stopName: StopName): Reason | null {
  const after = find(reasons, 'after_item') ?? find(reasons, 'on_the_way');
  const before = find(reasons, 'before_item');
  const a = after === undefined ? null : stopName(after.params.stable_id);
  const b = before === undefined ? null : stopName(before.params.stable_id);
  if (a === null && b === null) return null;
  return {
    key: 'around',
    icon: 'arrow',
    text:
      a !== null && b !== null
        ? t({ id: 'plan.add.why.between', message: `Between ${a} and ${b}` })
        : a !== null
          ? t({ id: 'plan.add.why.after', message: `Right after ${a}` })
          : t({ id: 'plan.add.why.before', message: `Before ${b ?? ''}` }),
  };
}

function blockerTile(day: DayFit, stopName: StopName): Reason | null {
  const reasons = day.reasons;
  if (find(reasons, 'closed_that_day') !== undefined) {
    return {
      key: 'blocker',
      icon: 'lock',
      text: t({ id: 'plan.add.why.closed', message: 'Closed that day' }),
    };
  }
  if (find(reasons, 'no_window') !== undefined) {
    return {
      key: 'blocker',
      icon: 'lock',
      text: t({ id: 'plan.add.why.noWindow', message: 'No free time that day' }),
    };
  }
  if (find(reasons, 'travel_day') !== undefined) {
    return {
      key: 'blocker',
      icon: 'plane',
      text: t({ id: 'plan.add.why.travelDay', message: 'A travel day' }),
    };
  }
  const needsMove = find(reasons, 'needs_move');
  if (needsMove !== undefined) {
    const stop = stopName(needsMove.params.stable_id);
    return {
      key: 'blocker',
      icon: 'arrow',
      text:
        stop === null
          ? t({ id: 'plan.add.why.needsMove', message: 'Only fits if a stop moves' })
          : t({ id: 'plan.add.why.needsMoveNamed', message: `Only fits if ${stop} moves` }),
    };
  }
  return null;
}

/**
 * Up to four tiles for WHY {time}, in the design's order (hours, crowds, getting there, weather),
 * with what the block sits between when there is room: a suggested time always says why.
 */
export function reasonTiles(
  day: DayFit | null,
  month: string,
  stopName: StopName = () => null,
): Reason[] {
  if (day === null) return [];
  const tiles = [
    blockerTile(day, stopName),
    hoursTile(day.reasons),
    crowdTile(day.reasons),
    travelTile(day.reasons),
    aroundTile(day.reasons, stopName),
    weatherTile(day.reasons, month),
  ].filter((tile): tile is Reason => tile !== null);
  return tiles.slice(0, 4);
}

/** The line under the new block: "New · quiet till about 10", or just "New". */
export function blockDetail(day: DayFit | null): string {
  const quiet = day === null ? undefined : find(day.reasons, 'quiet_until');
  if (quiet === undefined) return t({ id: 'plan.add.block.new', message: 'New' });
  const hour = hourText(quiet.params.time);
  return t({ id: 'plan.add.block.newQuiet', message: `New · quiet till about ${hour}` });
}

/** "07:15 · LEAVE THE STAY · CAR 45 MIN" when the block is the day's first stop after the stay. */
export function leaveLine(day: DayFit | null, startMin: number): string | null {
  if (day === null) return null;
  const drive = find(day.reasons, 'drive_minutes');
  const walk = find(day.reasons, 'walk_minutes');
  const leg = drive ?? walk;
  if (leg === undefined || leg.params.from !== 'stay') return null;
  const time = clockOf(startMin - leg.params.minutes);
  const minutes = String(leg.params.minutes);
  return drive !== undefined
    ? t({ id: 'plan.add.leave.car', message: `${time} · LEAVE THE STAY · CAR ${minutes} MIN` })
    : t({ id: 'plan.add.leave.walk', message: `${time} · LEAVE THE STAY · WALK ${minutes} MIN` });
}

/** "SAT 17 · FREE DAY", or "SAT 17". */
export function dayHeader(dayLabel: string, day: DayFit | null): string {
  const free = day !== null && find(day.reasons, 'free_day') !== undefined;
  return free ? t({ id: 'plan.add.dayHeader.free', message: `${dayLabel} · FREE DAY` }) : dayLabel;
}

export function addLabel(dayLabel: string, time: string, organiser: boolean): string {
  return organiser
    ? t({ id: 'plan.add.cta.add', message: `ADD TO ${dayLabel} · ${time}` })
    : t({ id: 'plan.add.cta.suggest', message: `SUGGEST FOR ${dayLabel} · ${time}` });
}

/** "1H30", "45 MIN": the block's length in the time column. */
export function lengthLabel(minutes: number): string {
  const hours = String(Math.floor(minutes / 60));
  const rest = String(minutes % 60).padStart(2, '0');
  if (minutes < 60) {
    const only = String(minutes);
    return t({ id: 'plan.add.length.minutes', message: `${only} MIN` });
  }
  return minutes % 60 === 0
    ? t({ id: 'plan.add.length.hours', message: `${hours}H` })
    : t({ id: 'plan.add.length.hoursMinutes', message: `${hours}H${rest}` });
}

/** "Gunung Kawi is 10 min on. Add it too?" */
export function nearbyLine(name: string, minutes: number): string {
  const count = String(minutes);
  // Next door reads as "0 min on" otherwise.
  if (minutes <= 1) {
    return t({ id: 'plan.add.nearbyNextDoor', message: `${name} is right next door. Add it too?` });
  }
  return t({ id: 'plan.add.nearby', message: `${name} is ${count} min on. Add it too?` });
}

export function moveLabel(dayLabel: string, time: string): string {
  return t({ id: 'plan.add.cta.move', message: `MOVE IT TO ${dayLabel} · ${time}` });
}

export function offlineNote(guideName: string): string {
  return t({
    id: 'plan.add.offline',
    message: `No signal: ${guideName} works out the reasons once you’re back.`,
  });
}

export function pickedLine(guide: string): string {
  return t({ id: 'plan.add.line', message: `${guide} picked the day and time. Change anything.` });
}

export function whyTitle(time: string): string {
  return t({ id: 'plan.add.why.title', message: `WHY ${time}` });
}
