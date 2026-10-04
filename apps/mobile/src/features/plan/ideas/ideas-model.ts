/**
 * Ideas (7f-2) as plain data: how many of the crew's unplaced ideas fit without moving anything
 * booked and how many need the crew (split, a stop would move, or no day takes them yet), and each
 * idea's grade per day for the chips while it is dragged over them.
 */
import type { FitGrade, StoredFit } from '@cp/domain';

export interface IdeaFitView {
  readonly fit: StoredFit | null;
}

const isSplit = (fit: StoredFit): boolean =>
  fit.days.some((day) => day.reasons.some((reason) => reason.code === 'crew_split'));

/**
 * It fits a day as it is, the way Tokek places ideas: some day takes it for the whole crew with no
 * stop moved, and the crew isn't split on it. A slot that only part of the crew is free for is no
 * slot for an idea.
 */
export function fitsAsIs(fit: StoredFit | null): boolean {
  if (fit === null || isSplit(fit)) return false;
  return fit.days.some(
    (day) =>
      day.grade !== 'no' &&
      day.slot !== null &&
      (day.needs_move ?? null) === null &&
      !day.reasons.some((reason) => reason.code === 'who_free'),
  );
}

export interface IdeasSummary {
  readonly total: number;
  readonly fitting: number;
  readonly needCrew: number;
  /** Ideas with no worked-out fit yet (offline, or the plan check hasn't run). */
  readonly unknown: number;
}

export function ideasSummary(ideas: readonly IdeaFitView[]): IdeasSummary {
  let fitting = 0;
  let unknown = 0;
  for (const idea of ideas) {
    if (idea.fit === null) unknown += 1;
    else if (fitsAsIs(idea.fit)) fitting += 1;
  }
  return { total: ideas.length, fitting, needCrew: ideas.length - fitting - unknown, unknown };
}

/** The idea's grade on each day number, for the chips it passes over. */
export function gradesByDay(fit: StoredFit | null): ReadonlyMap<number, FitGrade> {
  return new Map((fit?.days ?? []).map((day) => [day.day_no, day.grade]));
}
