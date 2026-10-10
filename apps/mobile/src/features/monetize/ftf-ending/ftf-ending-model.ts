/**
 * The free first trip ending (9.21): the window's last days, what the crew keeps for good and what
 * pauses when it closes. A grant ops revoked, or one whose window closed, has no ending to show.
 */
/* eslint-disable lingui/no-unlocalized-strings -- row keys, never copy. */
import { ftfDaysLeft, ftfEndingDue } from '@cp/domain';

export interface FtfGrantRow {
  readonly ends_at: string;
  readonly abuse_decision: string;
  readonly place: string | null;
}

export interface FtfEndingModel {
  readonly place: string;
  readonly endsAt: Date;
  readonly daysLeft: number;
  /** In the last three days: the moment the push and the recap card are for. */
  readonly due: boolean;
}

export function ftfEndingModel(row: FtfGrantRow | undefined, now: Date): FtfEndingModel | null {
  if (row === undefined || row.abuse_decision === 'revoked') return null;
  const endsAt = new Date(row.ends_at);
  if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= now.getTime()) return null;
  return {
    place: row.place ?? '',
    endsAt,
    daysLeft: ftfDaysLeft(endsAt, now),
    due: ftfEndingDue(endsAt, now),
  };
}

/** What stays with the crew after the window, and the perks that pause, in the page's order. */
export const FTF_KEPT = ['plan', 'photos', 'recap', 'critters', 'trail'] as const;
export const FTF_PAUSED = ['guide', 'redrafts', 'live_map', 'icons'] as const;
export type FtfKept = (typeof FTF_KEPT)[number];
export type FtfPaused = (typeof FTF_PAUSED)[number];
