/**
 * One guide offer in the crew chat, for any view of it: the offer's state for this member (open,
 * mine, full, expired) with its slots and who has claimed, and `claim()`, which takes one slot
 * through `claim_guide_offer` (online only; books and charges nothing) and reports why a claim was
 * refused.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire codes, never copy. */
import { useCallback, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { defineClientCommand } from '@/data/commands/summaries';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { useLiveQuery } from '../chat/data/live-rows';
import { useMinute } from '../meter/use-guide-meter';

export const claimGuideOfferCommand = defineClientCommand<{ readonly offer_id: string }>({
  name: 'claim_guide_offer',
  offline: false,
});

export type OfferState = 'open' | 'mine' | 'full' | 'expired';
export type ClaimProblem = 'offer_full' | 'offer_expired' | 'offline' | 'refused' | null;

export interface OfferRow {
  readonly slots_total: number;
  readonly slots_taken: number;
  readonly status: string;
  readonly expires_at: string | null;
  readonly mine: number;
  readonly slug: string | null;
}

export function offerState(row: OfferRow, now: number): OfferState {
  if (row.mine > 0) return 'mine';
  if (row.status === 'full' || row.slots_taken >= row.slots_total) return 'full';
  if (row.status !== 'open' || (row.expires_at !== null && Date.parse(row.expires_at) <= now)) {
    return 'expired';
  }
  return 'open';
}

const OFFER_SQL = `SELECT o.slots_total, o.slots_taken, o.status, o.expires_at,
    (SELECT count(*) FROM guide_offer_claims c
      WHERE c.offer_id = o.id AND c.user_id = (SELECT value FROM local_state WHERE id = '${OWNER_UID_KEY}')) AS mine,
    (SELECT g.slug FROM guides g WHERE g.id = ?) AS slug
  FROM guide_offers o WHERE o.id = ?`;

const CLAIMERS_SQL = `SELECT user_id FROM guide_offer_claims WHERE offer_id = ? ORDER BY created_at`;

export interface GuideOffer {
  readonly state: OfferState;
  readonly slotsLeft: number;
  readonly taken: number;
  readonly total: number;
  /** The guide's slug (its colour and art); `tokek` until the guide row syncs. */
  readonly guideSlug: string;
  /** Members who claimed a slot, first claim first. */
  readonly claimers: readonly string[];
}

/** `offerId` is the message's `ref_id`; `guideId` the guide who posted it. */
export function useGuideOffer(offerId: string | null, guideId: string | null) {
  const rows = useLiveQuery<OfferRow>(
    offerId === null ? null : OFFER_SQL,
    [guideId, offerId],
    ['guide_offers', 'guide_offer_claims', 'guides', 'local_state'],
  );
  const claimRows = useLiveQuery<{ user_id: string }>(
    offerId === null ? null : CLAIMERS_SQL,
    [offerId],
    ['guide_offer_claims'],
  );
  const command = useCommand(claimGuideOfferCommand);
  const now = useMinute();
  const [problem, setProblem] = useState<ClaimProblem>(null);

  const row = rows?.[0];
  const offer: GuideOffer | null =
    row === undefined
      ? null
      : {
          state: offerState(row, now.getTime()),
          slotsLeft: Math.max(0, row.slots_total - row.slots_taken),
          taken: row.slots_taken,
          total: row.slots_total,
          guideSlug: row.slug ?? 'tokek',
          claimers: (claimRows ?? []).map((claim) => claim.user_id),
        };

  const claim = useCallback(async (): Promise<boolean> => {
    if (offerId === null) return false;
    setProblem(null);
    const result = await command.send({ offer_id: offerId });
    if (result.kind === 'unavailable') setProblem('offline');
    if (result.kind === 'rejected') {
      const state = (result.detail as { state?: unknown } | undefined)?.state;
      setProblem(state === 'offer_full' || state === 'offer_expired' ? state : 'refused');
    }
    return result.kind === 'applied';
  }, [command, offerId]);

  return { offer, claim, claiming: command.pending, problem };
}
