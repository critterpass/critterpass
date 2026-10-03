/**
 * `post_place_decision` (docs/api-contracts-planning.md): a way out of a split goes to the crew as
 * a decision vote. One change set per option (trigger `split`, voting), and a decision poll over
 * them with the default decider policy and its closing time, whose card lands in crew chat.
 * `suggest` puts the chosen way against leaving the place out; `vote` puts the guide's two ways
 * against each other. When the poll closes, the winning change set applies
 * (../../planning/split/decision-close.ts) and the others are rejected.
 */
import { appendDomainEvent, armPollTimers } from '@cp/db';
import {
  changeSetOpsToEdits,
  DomainError,
  generateStableId,
  generateUuidV7,
  postPlaceDecisionPayloadSchema,
  type ChangeSetOp,
  type PostPlaceDecisionResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { tripVoters } from '../../plan/access';
import { chooseDeciderPolicy } from '../../plan/decider-policy';
import { loadPlanState, lockTripPlan, replay } from '../../plan/versioning';
import type { SplitCacheClient } from '../../planning/split/cache';
import { readSplit, type SplitOption } from '../../planning/split/route';
import { defineCommand } from '../_framework/define-command';
import { postPollCard } from '../polls/candidates';
import { requireStanceTaker } from './stance-access';

const LEAVE_OUT = { en: 'Leave it out', vi: 'Bỏ qua chỗ này' } as const;

/** The ops one option makes: move the place where it already sits, or add it; swap for another. */
function opsFor(
  option: SplitOption,
  input: {
    readonly dayNo: number;
    readonly tz: string;
    readonly placeId: string;
    readonly inPlan: { readonly stableId: string; readonly dayNo: number } | null;
    readonly crew: readonly string[];
    readonly category: string;
  },
): ChangeSetOp[] {
  const attendees = option.going_count < input.crew.length ? option.attendee_ids : [];
  const affected = option.attendee_ids.length > 0 ? [...input.crew] : [];
  const when = {
    day_no: input.dayNo,
    starts_at: option.starts_at,
    ends_at: option.ends_at,
    attendee_ids: [...attendees],
  };
  const base = { reason: option.title, affected_user_ids: affected, booking_impact: false };
  const add: ChangeSetOp = {
    ...base,
    op: 'add',
    target: generateStableId(),
    after: { ...when, tz: input.tz, poi_id: option.poi_id, category: input.category },
  };
  if (input.inPlan === null) return [add];
  if (option.poi_id !== input.placeId) {
    return [{ ...base, op: 'remove', target: input.inPlan.stableId }, add];
  }
  const op = input.inPlan.dayNo === input.dayNo ? 'retime' : 'move';
  return [{ ...base, op, target: input.inPlan.stableId, after: when }];
}

async function planFacts(tx: pg.PoolClient, versionId: string, placeId: string) {
  const { rows: days } = await tx.query<{ id: string; day_no: number }>(
    'SELECT id, day_no FROM plan_days WHERE version_id = $1',
    [versionId],
  );
  const { rows: here } = await tx.query<{ stable_id: string; day_no: number }>(
    `SELECT i.stable_id, d.day_no FROM plan_items i JOIN plan_days d ON d.id = i.day_id
      WHERE i.version_id = $1 AND i.poi_id = $2 AND i.status IS DISTINCT FROM 'cancelled'
      LIMIT 1`,
    [versionId, placeId],
  );
  const { rows: trip } = await tx.query<{ tz: string; status: string; locale: string }>(
    `SELECT coalesce(t.tz, d.tz, 'UTC') AS tz, t.status, app.user_locale(app.uid()) AS locale
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.current_version_id = $1`,
    [versionId],
  );
  const inPlan = here[0];
  return {
    dayNo: new Map(days.map((day) => [day.id, day.day_no])),
    inPlan: inPlan === undefined ? null : { stableId: inPlan.stable_id, dayNo: inPlan.day_no },
    tz: trip[0]?.tz ?? 'UTC',
    inTrip: trip[0]?.status === 'in_trip',
    vi: (trip[0]?.locale ?? 'en').startsWith('vi'),
  };
}

export function postPlaceDecisionCommand(deps: { readonly redis: SplitCacheClient }) {
  return defineCommand({
    name: 'post_place_decision',
    v: 1,
    schema: postPlaceDecisionPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      await requireStanceTaker(tx, { tripId: payload.trip_id, poiId: payload.poi_id });
      const expected = payload.mode === 'suggest' ? 1 : 2;
      if (new Set(payload.option_ids).size !== expected) {
        throw new DomainError('VALIDATION', { reason: 'option_count' });
      }
    },
    handle: async (tx, payload, ctx): Promise<PostPlaceDecisionResult> => {
      const now = ctx.clock.serverNow;
      const head = await lockTripPlan(tx, payload.trip_id);
      if (head.currentVersionId === null) {
        throw new DomainError('STATE_INVALID', { reason: 'no_current_plan' });
      }
      const view = await readSplit(
        tx,
        { tripId: payload.trip_id, poiId: payload.poi_id, optionIds: payload.option_ids },
        { redis: deps.redis },
      );
      if (!view.split) throw new DomainError('STATE_INVALID', { reason: 'not_split' });
      if (view.options.length !== payload.option_ids.length) {
        throw new DomainError('VALIDATION', { reason: 'unknown_option' });
      }
      const crew = await tripVoters(tx, payload.trip_id, head.crewId);
      const plan = await planFacts(tx, head.currentVersionId, payload.poi_id);
      const state = await loadPlanState(tx, head.currentVersionId);
      const categories = await tx.query<{ id: string; category: string }>(
        'SELECT id, category FROM pois WHERE id = ANY($1::uuid[])',
        [view.options.map((option) => option.poi_id)],
      );
      const categoryOf = new Map(categories.rows.map((row) => [row.id, row.category]));
      const sets = view.options.map((option) => {
        const dayNo = plan.dayNo.get(option.day_id);
        if (dayNo === undefined) throw new DomainError('STATE_INVALID', { reason: 'stale_issue' });
        const category = categoryOf.get(option.poi_id) ?? 'activity';
        const ops = opsFor(option, { ...plan, dayNo, placeId: payload.poi_id, crew, category });
        replay(structuredClone(state), changeSetOpsToEdits(ops));
        return { id: generateUuidV7(), option, ops };
      });
      const choice = chooseDeciderPolicy({
        authorId: ctx.uid,
        ops: sets.flatMap((set) => set.ops),
        affectedUserIds: crew,
        costDeltaMinor: 0,
        inTrip: plan.inTrip,
        now,
        itemStarts: view.options.map((option) => new Date(option.starts_at)),
        holdExpiry: null,
      });
      const policy = choice.policy === 'self' ? 'any_affected' : choice.policy;
      const closesAt =
        choice.policy === 'self' ? new Date(now.getTime() + 86_400_000) : choice.closesAt;
      const pollId = generateUuidV7();
      const first = sets[0]?.option;
      const question =
        payload.mode === 'suggest' && first !== undefined
          ? `${first.title}?`
          : plan.vi
            ? `${view.options.map((o) => o.title).join(' hay ')}?`
            : `${view.options.map((o) => o.title).join(' or ')}?`;
      await asSystemRole(tx, async () => {
        await tx.query(
          `INSERT INTO polls (id, crew_id, trip_id, kind, question, created_by, eligible_voter_ids,
             decider_policy, threshold, closes_at, allow_change)
           VALUES ($1, $2, $3, 'decision', $4, $5, $6::uuid[], $7, $8, $9, true)`,
          [
            pollId,
            head.crewId,
            payload.trip_id,
            question.slice(0, 140),
            ctx.uid,
            crew,
            policy,
            choice.policy === 'self' ? null : choice.threshold,
            closesAt,
          ],
        );
        for (const [position, set] of sets.entries()) {
          await tx.query(
            `INSERT INTO change_sets (id, trip_id, base_version_id, trigger, author_kind, author_id,
               ops)
             VALUES ($1, $2, $3, 'split', 'user', $4, $5)`,
            [set.id, payload.trip_id, head.currentVersionId, ctx.uid, JSON.stringify(set.ops)],
          );
          await tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [set.id]);
          await tx.query("UPDATE change_sets SET status = 'voting', poll_id = $2 WHERE id = $1", [
            set.id,
            pollId,
          ]);
          await tx.query(
            `INSERT INTO poll_options (poll_id, crew_id, kind, ref_id, label, proposed_by, position)
             VALUES ($1, $2, 'changeset', $3, $4, $5, $6)`,
            [pollId, head.crewId, set.id, set.option.title, ctx.uid, position],
          );
        }
        if (payload.mode === 'suggest') {
          await tx.query(
            `INSERT INTO poll_options (poll_id, crew_id, kind, label, proposed_by, position)
             VALUES ($1, $2, 'text', $3, $4, 1)`,
            [pollId, head.crewId, plan.vi ? LEAVE_OUT.vi : LEAVE_OUT.en, ctx.uid],
          );
        }
        await appendDomainEvent(tx, {
          type: 'poll.created',
          aggregateKind: 'poll',
          aggregateId: pollId,
          actorKind: 'user',
          actorId: ctx.uid,
          payload: {
            poll_id: pollId,
            crew_id: head.crewId,
            trip_id: payload.trip_id,
            kind: 'decision',
            created_by: ctx.uid,
          },
          crewId: head.crewId,
          tripId: payload.trip_id,
        });
        for (const set of sets) {
          await appendDomainEvent(tx, {
            type: 'change_set.proposed',
            aggregateKind: 'change_set',
            aggregateId: set.id,
            actorKind: 'user',
            actorId: ctx.uid,
            payload: { trip_id: payload.trip_id, change_set_id: set.id },
            crewId: head.crewId,
            tripId: payload.trip_id,
          });
        }
        await armPollTimers(tx, pollId, null, closesAt, now);
        await postPollCard(tx, {
          crewId: head.crewId,
          tripId: payload.trip_id,
          pollId,
          uid: ctx.uid,
          body: question,
        });
      });
      return { poll_id: pollId };
    },
  });
}
