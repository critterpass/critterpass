/**
 * A redraft's changes as the diff screen lays them out. The server diffs the day on stable item
 * ids (`add`, `remove`, `retime`, `swap`); the screen shows each change as one card, old line
 * struck and new line under it, so a stop taken out and a stop put in at about the same time read
 * as one swap. Two or more small time shifts fold into one summary card. Each card knows every
 * stable id it stands for, so toggling it off keeps all of them as they were.
 */
/* eslint-disable lingui/no-unlocalized-strings -- op names and regex, never copy. */
import type { DraftPlace, RedraftChange, RedraftItemSnapshot, RedraftMetrics } from '@cp/domain';

export interface CardLine {
  readonly name: string;
  readonly startsAt: string;
}

export type ChangeCard =
  | {
      readonly kind: 'change';
      readonly key: string;
      readonly stableIds: readonly string[];
      readonly before: CardLine | null;
      readonly after: CardLine | null;
      readonly reason: string | null;
    }
  | {
      /** Small time shifts, summed up in one line. */
      readonly kind: 'shifts';
      readonly key: string;
      readonly stableIds: readonly string[];
      readonly count: number;
      /** The largest shift, in minutes. */
      readonly maxMin: number;
    };

/** A retime within this many minutes is a small shift. */
export const SMALL_SHIFT_MIN = 30;

type Places = Readonly<Record<string, DraftPlace>>;

function lineOf(snapshot: RedraftItemSnapshot | null, places: Places): CardLine | null {
  if (snapshot === null) return null;
  const name = snapshot.poi_id === null ? undefined : places[snapshot.poi_id]?.name;
  return { name: name ?? '', startsAt: snapshot.starts_at };
}

function minutesBetween(a: string, b: string): number {
  return Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 60_000);
}

function byStart(a: RedraftChange, b: RedraftChange): number {
  const at = (c: RedraftChange) => (c.after ?? c.before)?.starts_at ?? '';
  return at(a).localeCompare(at(b));
}

/**
 * Drops sentences that claim the guide booked, reserved or held something: nothing is booked
 * before the crew has seen the plan, whatever the model wrote.
 */
export function truthfulReason(text: string | null): string | null {
  if (text === null) return null;
  const sentences = text.match(/[^.!?]+[.!?]*/gu) ?? [];
  const kept = sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => !/\b(I|we)(['’]ve)?\s+(booked|reserved|held)\b/iu.test(sentence));
  const joined = kept.join(' ').trim();
  return joined === '' ? null : joined;
}

export function changeCards(changes: readonly RedraftChange[], places: Places): ChangeCard[] {
  const removes = changes.filter((c) => c.op === 'remove').sort(byStart);
  const adds = changes.filter((c) => c.op === 'add').sort(byStart);
  const edits = changes.filter((c) => c.op === 'swap' || c.op === 'retime');
  const shifts = edits.filter(
    (c) =>
      c.op === 'retime' &&
      c.before !== null &&
      c.after !== null &&
      minutesBetween(c.before.starts_at, c.after.starts_at) <= SMALL_SHIFT_MIN,
  );
  const foldShifts = shifts.length >= 2;
  const cards: { at: string; card: ChangeCard }[] = [];
  const pairs = Math.max(removes.length, adds.length);
  for (let i = 0; i < pairs; i += 1) {
    const out = removes[i];
    const into = adds[i];
    const ids = [out?.stable_id, into?.stable_id].filter((id): id is string => id !== undefined);
    const after = lineOf(into?.after ?? null, places);
    const before = lineOf(out?.before ?? null, places);
    cards.push({
      at: after?.startsAt ?? before?.startsAt ?? '',
      card: {
        kind: 'change',
        key: ids.join('+'),
        stableIds: ids,
        before,
        after,
        reason: truthfulReason(into?.reason ?? out?.reason ?? null),
      },
    });
  }
  for (const edit of edits) {
    if (foldShifts && shifts.includes(edit)) continue;
    const after = lineOf(edit.after, places);
    const before = lineOf(edit.before, places);
    cards.push({
      at: after?.startsAt ?? before?.startsAt ?? '',
      card: {
        kind: 'change',
        key: edit.stable_id,
        stableIds: [edit.stable_id],
        before,
        after,
        reason: truthfulReason(edit.reason),
      },
    });
  }
  cards.sort((a, b) => a.at.localeCompare(b.at));
  const result = cards.map((entry) => entry.card);
  if (foldShifts) {
    result.push({
      kind: 'shifts',
      key: 'shifts',
      stableIds: shifts.map((c) => c.stable_id),
      count: shifts.length,
      maxMin: Math.max(
        ...shifts.map((c) => minutesBetween(c.before?.starts_at ?? '', c.after?.starts_at ?? '')),
      ),
    });
  }
  return result;
}

/** The stable ids to leave as they were when keeping, from the cards toggled off. */
export function excludedIds(cards: readonly ChangeCard[], off: ReadonlySet<string>): string[] {
  return cards.filter((card) => off.has(card.key)).flatMap((card) => [...card.stableIds]);
}

export type MetricChip =
  | { readonly kind: 'transit'; readonly deltaMin: number }
  | { readonly kind: 'pace'; readonly pace: RedraftMetrics['pace'] }
  | { readonly kind: 'must_dos'; readonly kept: number; readonly total: number }
  | { readonly kind: 'cost'; readonly deltaMinor: number; readonly currency: string };

/** The deterministic facts under the changes; cost only when it moved, must-dos only if any. */
export function metricChips(metrics: RedraftMetrics | null): MetricChip[] {
  if (metrics === null) return [];
  const chips: MetricChip[] = [
    { kind: 'transit', deltaMin: metrics.transit_delta_min },
    { kind: 'pace', pace: metrics.pace },
  ];
  if (metrics.must_dos_total > 0) {
    chips.push({ kind: 'must_dos', kept: metrics.must_dos_kept, total: metrics.must_dos_total });
  }
  if (metrics.cost_delta_pp_minor !== 0) {
    chips.push({
      kind: 'cost',
      deltaMinor: metrics.cost_delta_pp_minor,
      currency: metrics.currency,
    });
  }
  return chips;
}

export type RedraftPhase = 'thinking' | 'ready' | 'identical' | 'failed' | 'settled';

/**
 * What the redraft screen shows: the thinking beat until the job has delivered and the beat has
 * run, then the diff; a redraft that could not beat the day or failed (its unit was given back);
 * or one the organiser has already kept or put back.
 */
export function redraftPhase(input: {
  readonly status: string | null;
  readonly outcome: 'changed' | 'identical' | null;
  /** The reservation: null while open, `committed` once kept or put back, `released` if it did not count. */
  readonly settled: string | null;
  readonly beatDone: boolean;
}): RedraftPhase {
  const { status, outcome, settled, beatDone } = input;
  if (settled === 'committed') return 'settled';
  if (status === 'failed' || status === 'cancelled') return 'failed';
  if (outcome === 'identical') return beatDone ? 'identical' : 'thinking';
  if (settled === 'released') return 'failed';
  if (status === 'succeeded' && outcome === 'changed') return beatDone ? 'ready' : 'thinking';
  return 'thinking';
}
