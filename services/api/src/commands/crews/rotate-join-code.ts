/**
 * `rotate_join_code` (docs/api-contracts.md §4.2): any active member retires the crew's live code
 * (or one trip's, with `trip_id`) and mints a fresh one for 14 days. Links carrying the old code
 * stop resolving at once (their cached share cards are purged); personal invites keep working
 * through their own invite rows.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import { crewChannel, DomainError, type RotateJoinCodeResult } from '@cp/domain';
import { z } from 'zod';

import { defineCommand } from '../_framework/define-command';
import { refreshShareCard } from '../invites/share-cards';
import { codeExpiry, mintJoinCode, requireActiveMember } from './shared';

const rotateJoinCodePayloadSchema = z.object({
  crew_id: z.uuid(),
  trip_id: z.uuid().optional(),
});

export const rotateJoinCodeCommand = defineCommand({
  name: 'rotate_join_code',
  v: 1,
  schema: rotateJoinCodePayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireActiveMember(tx, payload.crew_id, ctx.uid);
    if (payload.trip_id === undefined) return;
    const { rows } = await tx.query('SELECT 1 FROM trips WHERE id = $1 AND crew_id = $2', [
      payload.trip_id,
      payload.crew_id,
    ]);
    if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  },
  handle: async (tx, payload, ctx): Promise<RotateJoinCodeResult> => {
    const expiresAt = codeExpiry(ctx.clock.serverNow);
    const kind = payload.trip_id === undefined ? 'crew' : 'trip';
    const { rows: retired } = await tx.query<{ code: string }>(
      `SELECT code FROM join_codes WHERE target_kind = $1 AND target_id = $2 AND status = 'active'`,
      [kind, payload.trip_id ?? payload.crew_id],
    );
    const minted = await mintJoinCode(tx, {
      kind,
      ref: payload.trip_id ?? payload.crew_id,
      expiresAt,
      rotate: true,
    });
    for (const old of retired) await refreshShareCard(tx, 'invite', old.code);
    await appendDomainEvent(tx, {
      type: 'crew.code_rotated',
      aggregateKind: 'crew',
      aggregateId: payload.crew_id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { crew_id: payload.crew_id, join_code_id: minted.id },
      crewId: payload.crew_id,
    });
    await outbox(tx, crewChannel(payload.crew_id), 'crew.code_rotated', {
      crew_id: payload.crew_id,
    });
    return { crew_id: payload.crew_id, code: minted.code, expires_at: expiresAt.toISOString() };
  },
});
