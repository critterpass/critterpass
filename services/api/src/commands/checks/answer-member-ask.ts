/**
 * `answer_member_ask {ask_id, accept}`: the asked member says yes or no to an organiser's private
 * ask about their saves. Yes applies the ask's ops under the asker's authority while they are
 * still an organiser (else it goes to the crew as the member's own change set); no closes it.
 * Only the asked member may answer; answering the same way again answers as it stands, and a
 * different answer to a closed ask is `STATE_INVALID{ask_closed}`.
 */
import { appendDomainEvent } from '@cp/db';
import {
  answerMemberAskPayloadSchema,
  changeSetOpsSchema,
  changeSetOpsToEdits,
  DomainError,
  generateUuidV7,
  type AnswerMemberAskResult,
  type ChangeSetOp,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { advance, applyToGroup, lockChangeSet } from '../../plan/changeset-store';
import { loadPlanState, lockTripPlan, replay } from '../../plan/versioning';
import { defineCommand } from '../_framework/define-command';
import { createChangesetCommand } from '../changesets/create';
import { sendChangesetCommand } from '../changesets/send';

interface AskRow {
  readonly id: string;
  readonly trip_id: string;
  readonly asked_by: string;
  readonly member_id: string;
  readonly status: string;
  readonly ops: unknown;
  readonly crew_id: string;
}

const ASK_SQL = `SELECT a.id, a.trip_id, a.asked_by, a.member_id, a.status, a.ops, t.crew_id
  FROM member_asks a JOIN trips t ON t.id = a.trip_id WHERE a.id = $1`;

/** Applies the ask's ops as the asker (an organiser): approved by them, applied at once. */
async function applyAsAsker(
  tx: pg.PoolClient,
  ask: AskRow,
  ops: readonly ChangeSetOp[],
): Promise<'applied' | 'stale'> {
  const head = await lockTripPlan(tx, ask.trip_id);
  const base = head.currentVersionId;
  if (base === null) throw new DomainError('STATE_INVALID', { reason: 'no_current_plan' });
  replay(await loadPlanState(tx, base), changeSetOpsToEdits(ops));
  const id = generateUuidV7();
  await asSystemRole(tx, () =>
    tx.query(
      `INSERT INTO change_sets (id, trip_id, base_version_id, trigger, author_kind, author_id, ops)
       VALUES ($1, $2, $3, 'check', 'user', $4, $5)`,
      [id, ask.trip_id, base, ask.asked_by, JSON.stringify(ops)],
    ),
  );
  await appendDomainEvent(tx, {
    type: 'change_set.created',
    aggregateKind: 'change_set',
    aggregateId: id,
    actorKind: 'user',
    actorId: ask.asked_by,
    payload: { trip_id: ask.trip_id, change_set_id: id, source: 'user' },
    crewId: head.crewId,
    tripId: ask.trip_id,
  });
  let row = await lockChangeSet(tx, id);
  row = await advance(tx, row, ['proposed', 'approved'], { kind: 'organiser', uid: ask.asked_by });
  return (await applyToGroup(tx, row, { kind: 'user', id: ask.asked_by })).status;
}

async function askerIsOrganiser(tx: pg.PoolClient, ask: AskRow): Promise<boolean> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query(
      "SELECT 1 FROM trip_participants WHERE trip_id = $1 AND user_id = $2 AND role = 'organiser'",
      [ask.trip_id, ask.asked_by],
    ),
  );
  return rows.length > 0;
}

export const answerMemberAskCommand = defineCommand({
  name: 'answer_member_ask',
  v: 1,
  schema: answerMemberAskPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    // As the caller: only the asker and the asked member can read the ask at all.
    const { rows } = await tx.query<AskRow>(ASK_SQL, [payload.ask_id]);
    const ask = rows[0];
    if (ask === undefined) throw new DomainError('NOT_FOUND', { reason: 'ask' });
    if (ask.member_id !== ctx.uid)
      throw new DomainError('FORBIDDEN', { reason: 'not_asked_member' });
  },
  handle: async (tx, payload, ctx): Promise<AnswerMemberAskResult> => {
    const ask = (
      await asSystemRole(tx, () => tx.query<AskRow>(`${ASK_SQL} FOR UPDATE OF a`, [payload.ask_id]))
    ).rows[0];
    if (ask === undefined) throw new DomainError('NOT_FOUND', { reason: 'ask' });
    const status = payload.accept ? 'accepted' : 'declined';
    if (ask.status === status) return { ask_id: ask.id, status, change_set_id: null };
    if (ask.status !== 'open') throw new DomainError('STATE_INVALID', { reason: 'ask_closed' });
    let changeSetId: string | null = null;
    if (payload.accept) {
      const ops = changeSetOpsSchema.parse(ask.ops);
      if (await askerIsOrganiser(tx, ask)) {
        if ((await applyAsAsker(tx, ask, ops)) === 'stale') {
          throw new DomainError('STATE_INVALID', { reason: 'ask_closed' });
        }
      } else {
        const head = await lockTripPlan(tx, ask.trip_id);
        if (head.currentVersionId === null) {
          throw new DomainError('STATE_INVALID', { reason: 'no_current_plan' });
        }
        const created = await createChangesetCommand.handle(
          tx,
          {
            trip_id: ask.trip_id,
            base_version: head.currentVersionId,
            ops,
            source: 'user',
            trigger: 'check',
          },
          ctx,
        );
        await sendChangesetCommand.handle(tx, { changeset_id: created.change_set_id }, ctx);
        changeSetId = created.change_set_id;
      }
    }
    await asSystemRole(tx, () =>
      tx.query('UPDATE member_asks SET status = $2, answered_at = now() WHERE id = $1', [
        ask.id,
        status,
      ]),
    );
    await appendDomainEvent(tx, {
      type: 'check.member_ask_answered',
      aggregateKind: 'member_ask',
      aggregateId: ask.id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { trip_id: ask.trip_id, ask_id: ask.id, member_id: ctx.uid, status },
      crewId: ask.crew_id,
      tripId: ask.trip_id,
    });
    return { ask_id: ask.id, status, change_set_id: changeSetId };
  },
});
