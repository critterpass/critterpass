/**
 * What the change poster (the `cp.changeset` notification's expanded view) draws without a fetch:
 * up to three before → after rows ("Campuhan Ridge 13:00 → 15:30", a new stop with no "before", a
 * dropped one with no "after"), the yeses so far against the yeses needed, who said yes (initial
 * and crew colour, never a name), and when the vote closes. Times are the trip's local clock.
 */
import {
  changeSetOpSchema,
  GUIDE_COLOURS,
  unixSeconds,
  type ChangeSetOp,
  type GuideColour,
  type PollDeciderPolicy,
} from '@cp/domain';
import type pg from 'pg';

export const POSTER_ROWS = 3;
/** The poster's footer stack holds this many faces. */
export const POSTER_VOTERS = 4;
const LABEL_MAX = 32;

export interface ChangeRow {
  readonly label: string;
  readonly from: string | null;
  readonly to: string | null;
}

export interface PosterVoter {
  readonly initial: string;
  readonly tone: GuideColour | null;
}

function clock(iso: string | undefined, tz: string): string | null {
  if (iso === undefined) return null;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: tz,
  }).format(new Date(iso));
}

function shorten(text: string): string {
  const chars = [...text.trim()];
  return chars.length <= LABEL_MAX ? chars.join('') : `${chars.slice(0, LABEL_MAX - 1).join('')}…`;
}

function placeIdOf(op: ChangeSetOp): string | null {
  return op.after?.poi_id ?? op.before?.poi_id ?? null;
}

/** The stop changes as poster rows; ops the reviewer turned off and driver picks are left out. */
export function changeRows(
  rawOps: readonly unknown[],
  placeNames: ReadonlyMap<string, string>,
  tz: string,
): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const raw of rawOps) {
    const parsed = changeSetOpSchema.safeParse(raw);
    if (!parsed.success) continue;
    const op = parsed.data;
    if (op.accepted === false || op.op === 'assign_provider') continue;
    const placeId = placeIdOf(op);
    const name =
      (placeId === null ? undefined : placeNames.get(placeId)) ??
      op.after?.custom_place?.name ??
      op.before?.custom_place?.name;
    if (name === undefined) continue;
    rows.push({
      label: shorten(name),
      from: op.op === 'add' ? null : clock(op.before?.starts_at, tz),
      to: op.op === 'remove' ? null : clock(op.after?.starts_at, tz),
    });
    if (rows.length === POSTER_ROWS) break;
  }
  return rows;
}

/** How many yeses decide the change under its policy. */
export function yesesNeeded(
  policy: PollDeciderPolicy | null,
  threshold: number | null,
  eligible: number,
): number {
  switch (policy) {
    case 'threshold_n':
      return Math.max(1, threshold ?? 1);
    case 'majority_of_affected':
      return Math.floor(eligible / 2) + 1;
    case 'organiser':
    case 'any_affected':
      return 1;
    case null:
      return Math.max(1, eligible);
  }
}

/** A member's crew colour from `crew_members.colour` (`accent` or `accent/ring`). */
export function memberTone(colour: string | null): GuideColour | null {
  const accent = colour?.split('/')[0] ?? '';
  return (GUIDE_COLOURS as readonly string[]).includes(accent) ? (accent as GuideColour) : null;
}

export function posterVoter(name: string | null, colour: string | null): PosterVoter {
  return {
    initial: ([...(name ?? '').trim()][0] ?? '?').toUpperCase(),
    tone: memberTone(colour),
  };
}

export interface ChangesetPosterInput {
  readonly changeSetId: string;
  readonly crewId: string;
  readonly tz: string;
  readonly policy: PollDeciderPolicy | null;
  readonly threshold: number | null;
  readonly eligible: number;
  readonly yesVoterIds: readonly string[];
  readonly closesAt: Date | null;
}

export async function changesetPosterCtx(
  tx: pg.PoolClient,
  input: ChangesetPosterInput,
): Promise<Record<string, unknown>> {
  const ops = await tx.query<{ ops: unknown[] }>('SELECT ops FROM change_sets WHERE id = $1', [
    input.changeSetId,
  ]);
  const rawOps = ops.rows[0]?.ops ?? [];
  const placeIds = rawOps.flatMap((raw) => {
    const parsed = changeSetOpSchema.safeParse(raw);
    const placeId = parsed.success ? placeIdOf(parsed.data) : null;
    return placeId === null ? [] : [placeId];
  });
  const places =
    placeIds.length === 0
      ? []
      : (
          await tx.query<{ id: string; name: string }>(
            'SELECT id, name FROM pois WHERE id = ANY($1::uuid[])',
            [placeIds],
          )
        ).rows;
  const voters = (
    await tx.query<{ name: string | null; colour: string | null }>(
      `SELECT u.display_name AS name, m.colour
         FROM unnest($1::uuid[]) WITH ORDINALITY AS v(user_id, n)
         JOIN users u ON u.id = v.user_id
         LEFT JOIN crew_members m ON m.crew_id = $2 AND m.user_id = v.user_id
        ORDER BY v.n LIMIT $3`,
      [input.yesVoterIds, input.crewId, POSTER_VOTERS],
    )
  ).rows;
  return {
    diff: changeRows(rawOps, new Map(places.map((p) => [p.id, p.name])), input.tz),
    yes_count: input.yesVoterIds.length,
    needed: yesesNeeded(input.policy, input.threshold, input.eligible),
    closes_at: input.closesAt === null ? null : unixSeconds(input.closesAt),
    voters: voters.map((v) => posterVoter(v.name, v.colour)),
  };
}
