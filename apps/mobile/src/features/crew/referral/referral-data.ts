/**
 * The referral dashboard's live reads: the caller's referral code, the friends they referred (by
 * status only: pending, joined or stamped; a voided one is not listed) and how many referral
 * stamps their pass holds. Referee activity never reaches this screen.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and status values, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect, useState } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { watchRows } from '@/data/status/watch-rows';

/** Mints (once) or returns the caller's referral code; online only. */
export const MINT_REFERRAL_CODE = defineClientCommand<Record<string, never>>({
  name: 'mint_referral_code',
  offline: false,
});

export type FriendStatus = 'pending' | 'joined' | 'stamped';

export interface ReferredFriend {
  readonly id: string;
  readonly name: string | null;
  readonly status: FriendStatus;
}

export interface ReferralSnapshot {
  /** False until the first read of the local database lands. */
  readonly loaded: boolean;
  readonly code: string | null;
  readonly friends: readonly ReferredFriend[];
  readonly stamps: number;
}

interface FriendRow {
  readonly id: string;
  readonly status: string;
  readonly reward_kind: string | null;
  readonly display_name: string | null;
}

const UUID = /^[0-9a-f-]{36}$/iu;

export function friendStatus(status: string, rewardKind: string | null): FriendStatus | null {
  if (status === 'void') return null;
  if (status === 'qualified' && rewardKind !== null) return 'stamped';
  if (status === 'qualified' || status === 'joined') return 'joined';
  return 'pending';
}

export function watchReferrals(
  db: AbstractPowerSyncDatabase,
  uid: string,
  onSnapshot: (snapshot: ReferralSnapshot) => void,
): () => void {
  if (!UUID.test(uid)) return () => undefined;
  const me = `'${uid}'`;
  return watchRows<{ n: number }>(
    db,
    'SELECT 1 AS n',
    ['join_codes', 'referrals', 'users', 'stamps'],
    () => {
      void Promise.all([
        db.getAll<{ code: string }>(
          `SELECT code FROM join_codes WHERE created_by = ${me} AND target_kind = 'referral'
          AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        ),
        db.getAll<FriendRow>(
          `SELECT r.id, r.status, r.reward_kind, u.display_name FROM referrals r
           LEFT JOIN users u ON u.id = r.referee_id
          WHERE r.referrer_id = ${me} ORDER BY r.created_at DESC`,
        ),
        db.getAll<{ n: number }>(
          `SELECT count(*) AS n FROM stamps WHERE user_id = ${me} AND kind = 'referral'`,
        ),
      ]).then(([codes, friends, stamps]) =>
        onSnapshot({
          loaded: true,
          code: codes[0]?.code ?? null,
          friends: friends.flatMap((row) => {
            const status = friendStatus(row.status, row.reward_kind);
            if (status === null) return [];
            const first = row.display_name?.trim().split(/\s+/u)[0] ?? null;
            return [{ id: row.id, name: first, status }];
          }),
          stamps: stamps[0]?.n ?? 0,
        }),
      );
    },
  );
}

export function useReferrals(
  db: AbstractPowerSyncDatabase | null,
  uid: string | null,
): ReferralSnapshot {
  const [snapshot, setSnapshot] = useState<ReferralSnapshot>({
    loaded: false,
    code: null,
    friends: [],
    stamps: 0,
  });
  useEffect(() => {
    if (db === null || uid === null) return undefined;
    return watchReferrals(db, uid, setSnapshot);
  }, [db, uid]);
  return snapshot;
}
