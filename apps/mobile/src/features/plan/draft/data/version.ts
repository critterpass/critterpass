/**
 * A private draft version as the review screen reads it: one row per day (title, the day's first
 * stops, whose must-dos land on it, any closure or lottery note), which must-dos made it and why
 * the others did not, the cost per person against the locked target, and whether setup has
 * changed since the draft was made. Every number comes from the version's own planner output
 * (`coverage`, `metrics`, the items' times); nothing here is estimated on the phone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- column values and JSON keys, never copy. */
import {
  draftCoverageSchema,
  draftMetricsSchema,
  type ClosureRecord,
  type DraftCoverage,
  type DraftMetrics,
  type MustDoMissReason,
  type StayRow,
} from '@cp/domain';

import { parseJson } from './rows';

export interface VersionRow {
  readonly id: string;
  readonly status: string;
  readonly parent_id: string | null;
  readonly created_at: string;
  readonly cost_pp_minor: number | null;
  readonly currency: string | null;
  readonly metrics: string | null;
  readonly coverage: string | null;
}

export interface DayRow {
  readonly id: string;
  readonly day_no: number;
  readonly date: string;
  readonly theme: string | null;
}

export interface ItemRow {
  readonly day_id: string;
  readonly stable_id: string;
  readonly starts_at: string;
  readonly tz: string;
  readonly poi_id: string | null;
  readonly must_do_id: string | null;
  readonly category: string | null;
  readonly booking_id: string | null;
  readonly locked_reason: string | null;
}

export interface MustDoRow {
  readonly id: string;
  readonly owner_id: string;
  readonly title: string;
  readonly external_action: string | null;
  readonly external_deadline: string | null;
}

export interface Person {
  readonly uid: string;
  readonly name: string;
  readonly joinIndex: number;
}

/** The setup inputs as they are now, to compare with the ones the draft was built from. */
export interface SetupNow {
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly mustDoIds: readonly string[];
  readonly budgetVersion: number | null;
  readonly roomsVersion: number | null;
}

export type SetupChange = 'dates' | 'must_dos' | 'budget' | 'rooms';

export interface ReviewStop {
  readonly name: string;
  /** The stop's start as an instant, with the zone to read it in. */
  readonly startsAt: string;
  readonly tz: string;
  /** Booked or a must-do: a redraft keeps it where it is. */
  readonly locked: boolean;
}

export interface ReviewDay {
  readonly dayNo: number;
  readonly date: string;
  readonly title: string;
  /** The day's named stops, in order. */
  readonly stops: readonly ReviewStop[];
  /** People whose must-do lands on this day, in crew order. */
  readonly owners: readonly Person[];
  /** A middle day with stops but no must-do and nothing booked: one the crew could drop. */
  readonly optional: boolean;
  /** A stop that sits in a cited closure on this day. */
  readonly closed: boolean;
  /** A must-do on this day that needs a lottery or booking ahead, with its result or deadline. */
  readonly lottery: { readonly action: string; readonly date: string } | null;
}

export interface MissingMustDo {
  readonly title: string;
  readonly owner: Person | null;
  readonly reason: MustDoMissReason;
}

export interface ReviewModel {
  readonly versionId: string;
  readonly days: readonly ReviewDay[];
  readonly mustDos: {
    readonly total: number;
    readonly made: number;
    readonly owners: readonly Person[];
    readonly missing: readonly MissingMustDo[];
  };
  readonly costPpMinor: number;
  readonly currency: string;
  /** How far over the locked target, per person; 0 when within it or with no target. */
  readonly overByMinor: number;
  readonly stays: readonly StayRow[];
  readonly closures: readonly ClosureRecord[];
  /** What setup changed since the draft; empty when it still matches. */
  readonly stale: readonly SetupChange[];
  /** A must-do added after the draft that it does not place yet (its redraft is free). */
  readonly lateMustDo: boolean;
}

function coverageOf(row: VersionRow): DraftCoverage | null {
  const parsed = draftCoverageSchema.safeParse(parseJson<unknown>(row.coverage, null));
  return parsed.success ? parsed.data : null;
}

function metricsOf(row: VersionRow): DraftMetrics | null {
  const parsed = draftMetricsSchema.safeParse(parseJson<unknown>(row.metrics, null));
  return parsed.success ? parsed.data : null;
}

/** Which setup inputs moved since the draft's fingerprint. */
export function setupChanges(built: DraftCoverage['setup'], now: SetupNow): SetupChange[] {
  const changes: SetupChange[] = [];
  if (now.startDate !== built.start_date || now.endDate !== built.end_date) changes.push('dates');
  const before = new Set(built.must_do_ids);
  if (now.mustDoIds.length !== before.size || now.mustDoIds.some((id) => !before.has(id))) {
    changes.push('must_dos');
  }
  if (now.budgetVersion !== built.budget_version) changes.push('budget');
  if (now.roomsVersion !== built.rooms_version) changes.push('rooms');
  return changes;
}

function closedOn(closures: readonly ClosureRecord[], poiId: string | null, date: string): boolean {
  return closures.some(
    (c) => c.poi_id !== null && c.poi_id === poiId && c.closed_from <= date && date <= c.closed_to,
  );
}

export function buildReview(input: {
  readonly version: VersionRow;
  readonly days: readonly DayRow[];
  readonly items: readonly ItemRow[];
  readonly mustDos: readonly MustDoRow[];
  readonly people: readonly Person[];
  readonly setup: SetupNow;
}): ReviewModel {
  const { version, items, mustDos, people, setup } = input;
  const coverage = coverageOf(version);
  const metrics = metricsOf(version);
  const person = new Map(people.map((p) => [p.uid, p]));
  const mustDo = new Map(mustDos.map((m) => [m.id, m]));
  const places = coverage?.places ?? {};
  const closures = coverage?.closures ?? [];
  const flagged = new Set(
    (coverage?.flags ?? []).filter((f) => f.flag === 'closed_on_date').map((f) => f.stable_id),
  );
  const sorted = [...input.days].sort((a, b) => a.day_no - b.day_no);
  const firstNo = sorted[0]?.day_no;
  const lastNo = sorted[sorted.length - 1]?.day_no;
  const days = sorted.map((day): ReviewDay => {
    const dayItems = items
      .filter((item) => item.day_id === day.id)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const ownerIds = new Set(
      dayItems.flatMap((item) => {
        const owner = item.must_do_id === null ? undefined : mustDo.get(item.must_do_id);
        return owner === undefined ? [] : [owner.owner_id];
      }),
    );
    const lotteryMustDo = dayItems
      .map((item) => (item.must_do_id === null ? undefined : mustDo.get(item.must_do_id)))
      .find((m) => m?.external_action != null && m.external_deadline != null);
    return {
      dayNo: day.day_no,
      date: day.date,
      title: day.theme ?? '',
      stops: dayItems.flatMap((item): ReviewStop[] => {
        const name = item.poi_id === null ? undefined : places[item.poi_id]?.name;
        return name === undefined
          ? []
          : [{ name, startsAt: item.starts_at, tz: item.tz, locked: item.locked_reason !== null }];
      }),
      owners: people.filter((p) => ownerIds.has(p.uid)),
      optional:
        day.day_no !== firstNo &&
        day.day_no !== lastNo &&
        dayItems.length > 0 &&
        dayItems.every((item) => item.must_do_id === null && item.booking_id === null),
      closed: dayItems.some(
        (item) => flagged.has(item.stable_id) || closedOn(closures, item.poi_id, day.date),
      ),
      lottery:
        lotteryMustDo?.external_action != null && lotteryMustDo.external_deadline != null
          ? {
              action: lotteryMustDo.external_action,
              date: lotteryMustDo.external_deadline.slice(0, 10),
            }
          : null,
    };
  });
  const placedOwners = new Set(days.flatMap((day) => day.owners.map((p) => p.uid)));
  const built = coverage?.setup;
  const placedMustDos = new Set(
    items.flatMap((item) => (item.must_do_id === null ? [] : [item.must_do_id])),
  );
  return {
    versionId: version.id,
    days,
    mustDos: {
      total: coverage?.must_dos.total ?? 0,
      made: coverage?.must_dos.made ?? 0,
      owners: people.filter((p) => placedOwners.has(p.uid)),
      missing: (coverage?.must_dos.missing ?? []).map((miss) => ({
        title: mustDo.get(miss.must_do_id)?.title ?? '',
        owner: person.get(miss.owner_id) ?? null,
        reason: miss.reason,
      })),
    },
    costPpMinor: metrics?.cost_pp_minor ?? version.cost_pp_minor ?? 0,
    currency: metrics?.currency ?? version.currency ?? 'USD',
    overByMinor: metrics?.over_by_pp_minor ?? 0,
    stays: coverage?.stays ?? [],
    closures,
    stale: built === undefined ? [] : setupChanges(built, setup),
    lateMustDo:
      built !== undefined &&
      setup.mustDoIds.some((id) => !built.must_do_ids.includes(id) && !placedMustDos.has(id)),
  };
}
