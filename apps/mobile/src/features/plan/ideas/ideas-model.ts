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

/** It fits a day as it is: a best day that needs no stop moved, and the crew isn't split on it. */
export function fitsAsIs(fit: StoredFit | null): boolean {
  if (fit?.best == null || isSplit(fit)) return false;
  const best = fit.days.find((day) => day.day_id === fit.best?.day_id);
  return best !== undefined && (best.needs_move ?? null) === null;
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
