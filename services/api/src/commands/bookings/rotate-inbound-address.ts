/**
 * `rotate_inbound_address` (doc delta): a crew organiser retires the crew's forward address and
 * gets a fresh one (the crew name with a new suffix). Mail to the old address bounces from then on
 * ("no longer in use"); linked senders stay linked.
 */
import { emitEvent } from '@cp/db';
import { DomainError } from '@cp/domain';
import { z } from 'zod';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireActiveMember } from '../crews/shared';

const rotateInboundAddressPayloadSchema = z.object({ crew_id: z.uuid() });

export const rotateInboundAddressCommand = defineCommand({
  name: 'rotate_inbound_address',
  v: 1,
  schema: rotateInboundAddressPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const member = await requireActiveMember(tx, payload.crew_id, ctx.uid);
    if (member.role !== 'organiser') {
      throw new DomainError('FORBIDDEN', { reason: 'not_crew_organiser' });
    }
  },
  handle: async (tx, payload, ctx): Promise<{ crew_id: string; local_part: string }> => {
    const localPart = await asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ part: string }>(
        'SELECT app.issue_inbound_address($1, true) AS part',
        [payload.crew_id],
      );
      return rows[0]?.part as string;
    });
    await emitEvent(tx, {
      type: 'crew.inbound_rotated',
      aggregateKind: 'crew',
      aggregateId: payload.crew_id,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId: payload.crew_id,
      payload: { crew_id: payload.crew_id },
    });
    return { crew_id: payload.crew_id, local_part: localPart };
  },
});
