/**
 * Webhook replay (ops): `replay_webhook {provider, event_id}` re-runs a provider's idempotent
 * handler for one stored event. There is no shared webhook table: each provider that keeps an
 * event store registers `defineWebhookReplay({provider, load, reapply})` from its own module, and
 * the replay runs inside the command's transaction (as app_system) with its audit row.
 */
import { DomainError } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineAdminArea, defineAdminCommand } from './registry';

export interface WebhookReplayDefinition<Event> {
  readonly provider: string;
  /** The stored event, or null when this provider never received it. */
  readonly load: (tx: pg.PoolClient, eventId: string) => Promise<Event | null>;
  /** Re-applies the event through the provider's idempotent handler; returns a short outcome. */
  readonly reapply: (tx: pg.PoolClient, event: Event) => Promise<string>;
}

type AnyReplay = WebhookReplayDefinition<unknown>;
const replays = new Map<string, AnyReplay>();

export function defineWebhookReplay<Event>(
  definition: WebhookReplayDefinition<Event>,
): WebhookReplayDefinition<Event> {
  if (replays.has(definition.provider)) {
    throw new Error(`webhook replay for ${definition.provider} is registered`);
  }
  replays.set(definition.provider, definition as unknown as AnyReplay);
  return definition;
}

export function webhookReplayProviders(): readonly string[] {
  return [...replays.keys()].sort();
}

export const replayWebhookPayloadSchema = z
  .object({
    provider: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(40),
    event_id: z.string().min(1).max(200),
  })
  .strict();

export function webhookReplayArea() {
  return defineAdminArea({
    id: 'webhook-replay',
    reads: [],
    commands: [
      defineAdminCommand({
        name: 'replay_webhook',
        schema: replayWebhookPayloadSchema,
        audit: (payload, result: { outcome: string }) => ({
          targetKind: 'webhook',
          detail: { key: `${payload.provider}:${payload.event_id}`, outcome: result.outcome },
          summary: `${payload.provider} · replayed ${payload.event_id} (${result.outcome})`,
          changes: [],
        }),
        handle: async (tx, payload) => {
          const replay = replays.get(payload.provider);
          if (replay === undefined) {
            throw new DomainError('VALIDATION', { reason: 'unknown_provider' });
          }
          const event = await replay.load(tx, payload.event_id);
          if (event === null) throw new DomainError('NOT_FOUND');
          return { outcome: await replay.reapply(tx, event) };
        },
      }),
    ],
  });
}
