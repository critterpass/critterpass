/**
 * `ask_member_about_saves {ask_id?, trip_id, user_id, idea_ids (1..3)}` (Balance the crew, 7h-5
 * ASK {NAME} FIRST): an organiser privately asks one member whether to add their saves. The ops are
 * worked out and checked now (each save where it fits without moving anything) and kept on a
 * two-party `member_asks` row that only the two of them can read; the member gets a push and an
 * inbox row with yes and no. Nothing goes to crew chat, and nothing about balance is stored.
 * Asking again while an ask to that member is open answers with the open ask.
 */
import { appendDomainEvent } from '@cp/db';
import {
  askMemberAboutSavesPayloadSchema,
  DomainError,
  generateUuidV7,
  type AskMemberAboutSavesResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { requireTripMember } from '../../plan/access';
import { loadCheckInput, type FixerDeps } from '../../planning/fixers/check-input';
import { defineCommand } from '../_framework/define-command';
import { memberSaves, opsForSaves } from './member-ask-ops';

async function isParticipant(tx: pg.PoolClient, tripId: string, uid: string): Promise<boolean> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query(
      `SELECT 1 FROM trips t
         JOIN crew_members m ON m.crew_id = t.crew_id AND m.status = 'active' AND m.user_id = $2
        WHERE t.id = $1 AND NOT EXISTS (
          SELECT 1 FROM trip_participants p
           WHERE p.trip_id = t.id AND p.user_id = $2 AND p.rsvp = 'out')`,
      [tripId, uid],
    ),
  );
  return rows.length > 0;
}

export function askMemberAboutSavesCommand(deps: FixerDeps) {
  return defineCommand({
    name: 'ask_member_about_saves',
    v: 1,
    schema: askMemberAboutSavesPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      const access = await requireTripMember(tx, payload.trip_id);
      if (!access.organiser) throw new DomainError('FORBIDDEN', { reason: 'not_organiser' });
      if (
        payload.user_id === ctx.uid ||
        !(await isParticipant(tx, payload.trip_id, payload.user_id))
      ) {
        throw new DomainError('FORBIDDEN', { reason: 'not_participant' });
      }
    },
    handle: async (tx, payload, ctx): Promise<AskMemberAboutSavesResult> => {
      const existing = await asSystemRole(tx, () =>
        tx.query<{ id: string }>(
          `SELECT id FROM member_asks
            WHERE (id = $1 OR (trip_id = $2 AND asked_by = $3 AND member_id = $4 AND status = 'open'))
            ORDER BY created_at DESC LIMIT 1`,
          [payload.ask_id ?? null, payload.trip_id, ctx.uid, payload.user_id],
        ),
      );
      const open = existing.rows[0];
      if (open !== undefined) return { ask_id: open.id };
      const ideas = await memberSaves(tx, {
        tripId: payload.trip_id,
        memberId: payload.user_id,
        ideaIds: payload.idea_ids,
      });
      const check = await loadCheckInput(tx, payload.trip_id, undefined, deps);
      const ops = await opsForSaves(tx, check, ideas);
      if (ops.length === 0) throw new DomainError('STATE_INVALID', { reason: 'no_fix' });
      const askId = payload.ask_id ?? generateUuidV7();
      await asSystemRole(tx, () =>
        tx.query(
          `INSERT INTO member_asks (id, trip_id, asked_by, member_id, idea_ids, ops)
           VALUES ($1, $2, $3, $4, $5::uuid[], $6)`,
          [
            askId,
            payload.trip_id,
            ctx.uid,
            payload.user_id,
            ideas.map((idea) => idea.id),
            JSON.stringify(ops),
          ],
        ),
      );
      await appendDomainEvent(tx, {
        type: 'check.member_asked',
        aggregateKind: 'member_ask',
        aggregateId: askId,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: {
          trip_id: payload.trip_id,
          ask_id: askId,
          asker_id: ctx.uid,
          member_id: payload.user_id,
        },
        crewId: check.trip.crewId,
        tripId: payload.trip_id,
      });
      return { ask_id: askId };
    },
  });
}
