/**
 * `proposal.waitlist`: a seat freed by a dropout goes to the next person waiting as an offer,
 * never a join. The crew growth offer machinery decides: exactly one open offer per free
 * seat, and a lapsed offer moves on to the next person (`waitlist.offer_expire`).
 */
import { PROPOSAL_QUEUES } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import { offerFreedSeats } from '../invites/waitlist-offer';

export async function runProposalWaitlist(pool: pg.Pool, tripId: string): Promise<number> {
  return (await offerFreedSeats(pool, tripId)).length;
}

export function proposalWaitlistJob(): AnyJobDefinition {
  return defineJob({
    queue: PROPOSAL_QUEUES.waitlist,
    schema: z.object({ trip_id: z.uuid() }),
    singletonKey: (data) => data.trip_id,
    async handler(data, { pool }) {
      return { offers: await runProposalWaitlist(pool, data.trip_id) };
    },
  });
}
