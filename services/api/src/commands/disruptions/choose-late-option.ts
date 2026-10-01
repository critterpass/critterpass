/**
 * `choose_late_option {disruption_id, option_id}` (3k-9): a member of the late party picks what to
 * do about the item they will miss the start of. Whoever is waiting there is told in crew chat at
 * once, in the guide's voice ("Wes and Jordan are 25 min late for Karsa Spa. Start without
 * them."); a changed pick posts a correction. The pick itself is applied by the worker, which
 * follows `late_option.chosen`: a retime or a draft to whoever runs the item, under the autonomy
 * policy. Only an option the planner offered can be picked.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import {
  channelName,
  chooseLateOptionPayloadSchema,
  DomainError,
  generateUuidV7,
  lateOptionsSchema,
  waitingCrewLine,
} from '@cp/domain';
import { localTime } from '@cp/planner';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireDisruption, type DisruptionView } from './shared';

async function requireLateParty(
  tx: pg.PoolClient,
  disruptionId: string,
  uid: string,
): Promise<DisruptionView> {
  const view = await requireDisruption(tx, disruptionId, uid);
  if (view.kind !== 'running_late') throw new DomainError('NOT_FOUND', { reason: 'disruption' });
  if (!view.traveller_ids.includes(uid)) {
    throw new DomainError('NOT_ELIGIBLE', { reason: 'not_in_late_party' });
  }
  return view;
}

interface LateFacts {
  readonly waiting_ids: string[];
  readonly names: string[];
  readonly late_min: number;
  readonly item_title: string;
  readonly tz: string;
}

async function lateFacts(tx: pg.PoolClient, view: DisruptionView): Promise<LateFacts> {
  const { rows } = await tx.query<LateFacts>(
    `SELECT coalesce(ARRAY(SELECT jsonb_array_elements_text(d.affected -> 'unaffected_ids')), '{}')
              AS waiting_ids,
            ARRAY(SELECT coalesce(nullif(u.display_name, ''), 'Someone') FROM users u
                   WHERE u.id = ANY($2::uuid[]) ORDER BY array_position($2::uuid[], u.id)) AS names,
            coalesce((d.facts ->> 'late_min')::int, 0) AS late_min,
            coalesce(d.facts ->> 'title', '') AS item_title,
            coalesce(t.tz, 'UTC') AS tz
       FROM disruptions d JOIN trips t ON t.id = d.trip_id WHERE d.id = $1`,
    [view.id, view.traveller_ids],
  );
  const facts = rows[0];
  if (facts === undefined) throw new DomainError('NOT_FOUND', { reason: 'disruption' });
  return facts;
}

export const chooseLateOptionCommand = defineCommand({
  name: 'choose_late_option',
  v: 1,
  schema: chooseLateOptionPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireLateParty(tx, payload.disruption_id, ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    const view = await requireLateParty(tx, payload.disruption_id, ctx.uid);
    if (view.status !== 'open') return { chosen: false, option: view.chosen_option_id };
    if (view.chosen_option_id === payload.option_id) {
      return { chosen: false, option: payload.option_id };
    }
    const option = lateOptionsSchema
      .parse(view.options)
      .find((candidate) => candidate.id === payload.option_id);
    if (option?.offered !== true) {
      throw new DomainError('NOT_ELIGIBLE', { reason: 'option_not_offered' });
    }
    return asSystemRole(tx, async () => {
      const facts = await lateFacts(tx, view);
      await tx.query(
        `UPDATE disruptions SET chosen_option_id = $2, chosen_by = $3, version = version + 1
          WHERE id = $1`,
        [view.id, option.id, ctx.uid],
      );
      let messageId: string | null = null;
      if (facts.waiting_ids.length > 0) {
        messageId = generateUuidV7();
        const body = waitingCrewLine(
          option.id,
          {
            names: facts.names,
            minutes: facts.late_min,
            title: facts.item_title,
            arrive:
              option.arrive_at === null ? null : localTime(new Date(option.arrive_at), facts.tz),
          },
          view.chosen_option_id !== null,
        );
        const inserted = await tx.query<{ seq: string }>(
          `INSERT INTO messages (id, crew_id, trip_id, sender_kind, guide_id, type, body, ref_kind, ref_id)
           VALUES ($1, $2, $3, 'guide', $4, 'system', $5, 'disruption', $6) RETURNING seq`,
          [messageId, view.crew_id, view.trip_id, view.guide_id, body, view.id],
        );
        await outbox(tx, channelName('crew_chat', view.crew_id), 'message.created', {
          crew_id: view.crew_id,
          message_id: messageId,
          seq: Number(inserted.rows[0]?.seq),
        });
      }
      await outbox(tx, channelName('trip_watch', view.trip_id), 'disruption.step', {
        disruption_id: view.id,
        action_id: 'late_option',
        state: option.id,
      });
      await appendDomainEvent(tx, {
        type: 'late_option.chosen',
        aggregateKind: 'trip',
        aggregateId: view.trip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: view.crew_id,
        tripId: view.trip_id,
        payload: { trip_id: view.trip_id, disruption_id: view.id, option: option.id },
      });
      return { chosen: true, option: option.id, message_id: messageId };
    });
  },
});
