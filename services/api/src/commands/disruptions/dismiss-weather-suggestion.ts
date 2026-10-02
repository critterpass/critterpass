/**
 * `dismiss_weather_suggestion {changeset_id}` (3e-2 banner): a trip member turns down the guide's
 * weather move. Its ChangeSet is rejected, the suggestion withdrawn and remembered as dismissed,
 * so the replan does not suggest a move for that item on that day again.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import { channelName, dismissWeatherSuggestionPayloadSchema, DomainError } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

interface Suggestion {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly status: string;
}

async function requireSuggestion(tx: pg.PoolClient, changeSetId: string): Promise<Suggestion> {
  // Read as the caller: RLS shows a trip's disruptions to its members only.
  const { rows } = await tx.query<Suggestion>(
    `SELECT d.id, d.trip_id, t.crew_id, d.status FROM disruptions d JOIN trips t ON t.id = d.trip_id
      WHERE d.change_set_id = $1 AND d.kind = 'weather' ORDER BY d.created_at DESC LIMIT 1`,
    [changeSetId],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'suggestion' });
  return row;
}

export const dismissWeatherSuggestionCommand = defineCommand({
  name: 'dismiss_weather_suggestion',
  v: 1,
  schema: dismissWeatherSuggestionPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireSuggestion(tx, payload.changeset_id);
  },
  handle: async (tx, payload, ctx) => {
    const suggestion = await requireSuggestion(tx, payload.changeset_id);
    if (suggestion.status !== 'open') return { dismissed: false, status: suggestion.status };
    return asSystemRole(tx, async () => {
      await tx.query(
        "UPDATE change_sets SET status = 'rejected' WHERE id = $1 AND status IN ('proposed', 'voting')",
        [payload.changeset_id],
      );
      await tx.query(
        `UPDATE disruptions SET status = 'withdrawn', resolved_at = now(), version = version + 1,
                facts = facts || '{"dismissed": "yes"}'::jsonb, chosen_by = $2
          WHERE id = $1`,
        [suggestion.id, ctx.uid],
      );
      await outbox(tx, channelName('trip_plan', suggestion.trip_id), 'forecast.band', {
        disruption_id: suggestion.id,
        change_set_id: payload.changeset_id,
        withdrawn: true,
      });
      await appendDomainEvent(tx, {
        type: 'weather.suggestion_dismissed',
        aggregateKind: 'change_set',
        aggregateId: payload.changeset_id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: suggestion.crew_id,
        tripId: suggestion.trip_id,
        payload: { trip_id: suggestion.trip_id, change_set_id: payload.changeset_id },
      });
      return { dismissed: true, status: 'withdrawn' };
    });
  },
});
