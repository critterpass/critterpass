/**
 * Anonymised offers to the whole crew ("Someone asked about cost. Offer everyone the cheaper room
 * option?"). Only in a crew of four or more, and the offer carries no name and no source.
 */
import { appendDomainEvent } from '@cp/db';
import { ANONYMOUS_MIN_CREW, DomainError, PROPOSAL_RT, type PrivateReason } from '@cp/domain';
import type pg from 'pg';

import { publishProposal, type ProposalRow } from './shared';

export type OfferKind = 'cheaper_room' | 'skip_day' | 'cheaper_stay';

const OFFER_TOPIC: Readonly<Record<OfferKind, PrivateReason>> = {
  cheaper_room: 'cost',
  cheaper_stay: 'cost',
  skip_day: 'plan',
};

export async function requireAnonymousCrew(tx: pg.PoolClient, tripId: string): Promise<void> {
  const { rows } = await tx.query<{ size: number }>('SELECT app.trip_crew_size($1) AS size', [
    tripId,
  ]);
  if ((rows[0]?.size ?? 0) < ANONYMOUS_MIN_CREW) {
    throw new DomainError('K_ANON_UNAVAILABLE', { min_crew: ANONYMOUS_MIN_CREW });
  }
}

/** Publishes the offer on `proposal:{id}` and appends `proposal.offer_published`. */
export async function publishOffer(
  tx: pg.PoolClient,
  proposal: ProposalRow,
  option: { readonly kind: OfferKind; readonly id: string },
  actorUid: string,
): Promise<void> {
  await publishProposal(tx, proposal.id, PROPOSAL_RT.offerPublished, { option });
  await appendDomainEvent(tx, {
    type: 'proposal.offer_published',
    aggregateKind: 'proposal',
    aggregateId: proposal.id,
    actorKind: 'user',
    actorId: actorUid,
    payload: {
      trip_id: proposal.trip_id,
      proposal_id: proposal.id,
      topic: OFFER_TOPIC[option.kind],
    },
    crewId: proposal.crew_id,
    tripId: proposal.trip_id,
  });
}
