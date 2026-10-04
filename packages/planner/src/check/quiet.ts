/**
 * Issues the organiser chose to keep as they are. A quiet mark names the issue (its kind and the
 * stops, booking or day it is about) and remembers the stops around it; it holds while those
 * neighbours stay the same and lapses when they change, or when a stop it names leaves the plan.
 * While it holds, the check leaves that issue out of its list and its counts.
 */
export interface QuietSubject {
  readonly kind: string;
  readonly stableIds: readonly string[];
  /** The day of an issue about a whole day; null when the stops (or a booking) say it all. */
  readonly dayNo: number | null;
  readonly bookingId: string | null;
}

export interface QuietMark extends QuietSubject {
  /** The neighbours when it was set; null until the first check after it reads the plan. */
  readonly around: string | null;
}

export interface QuietDay {
  readonly dayNo: number;
  readonly items: readonly { readonly stableId: string; readonly startsAt: Date }[];
}

export function quietKey(subject: QuietSubject): string {
  if (subject.bookingId !== null) return `${subject.kind}|booking:${subject.bookingId}`;
  if (subject.stableIds.length > 0)
    return `${subject.kind}|${[...subject.stableIds].sort().join(',')}`;
  return `${subject.kind}|day:${subject.dayNo ?? '-'}`;
}

function ordered(day: QuietDay): string[] {
  return [...day.items]
    .sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.stableId.localeCompare(b.stableId),
    )
    .map((item) => item.stableId);
}

/**
 * What surrounds the subject on the plan as it is: each stop with the stops before and after it
 * that day, or the whole day's order for an issue about a day. Null when a stop or the day is gone.
 */
export function aroundOf(subject: QuietSubject, days: readonly QuietDay[]): string | null {
  if (subject.bookingId !== null) return 'booking';
  const orders = days.map((day) => ({ dayNo: day.dayNo, ids: ordered(day) }));
  if (subject.stableIds.length === 0) {
    const day = orders.find((entry) => entry.dayNo === subject.dayNo);
    return day === undefined ? null : `${day.dayNo}:${day.ids.join('>')}`;
  }
  const parts: string[] = [];
  for (const id of [...subject.stableIds].sort()) {
    const day = orders.find((entry) => entry.ids.includes(id));
    if (day === undefined) return null;
    const index = day.ids.indexOf(id);
    parts.push(`${day.dayNo}:${day.ids[index - 1] ?? '^'}>${id}>${day.ids[index + 1] ?? '$'}`);
  }
  return parts.join('|');
}

export interface QuietSplit<Issue, Mark> {
  /** The issues the check shows and counts. */
  readonly live: Issue[];
  /** The marks that still hold, each with its neighbours filled in. */
  readonly marks: (Mark & { readonly around: string })[];
}

/** Drops the marks whose neighbours changed, then the issues the remaining marks keep quiet. */
export function splitQuiet<Issue, Mark extends QuietMark>(
  issues: readonly Issue[],
  subjectOf: (issue: Issue) => QuietSubject,
  marks: readonly Mark[],
  days: readonly QuietDay[],
): QuietSplit<Issue, Mark> {
  const held: (Mark & { readonly around: string })[] = [];
  for (const mark of marks) {
    const around = aroundOf(mark, days);
    if (around === null || (mark.around !== null && mark.around !== around)) continue;
    held.push({ ...mark, around });
  }
  const quiet = new Set(held.map(quietKey));
  return { live: issues.filter((issue) => !quiet.has(quietKey(subjectOf(issue)))), marks: held };
}
