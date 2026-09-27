/**
 * Command bookkeeping and event enums (docs/data-model.md §3.18, docs/api-contracts.md §2.4).
 */
import { z } from 'zod';

export const CMD_RESULT_STATUSES = ['applied', 'rejected', 'duplicate'] as const;
export const cmdResultStatusSchema = z.enum(CMD_RESULT_STATUSES);
export type CmdResultStatus = z.infer<typeof cmdResultStatusSchema>;

export const RT_OUTBOX_KINDS = ['publish', 'unsubscribe', 'disconnect'] as const;
export const rtOutboxKindSchema = z.enum(RT_OUTBOX_KINDS);
export type RtOutboxKind = z.infer<typeof rtOutboxKindSchema>;

/** Who performed the action a `domain_events`/`activity_events` row records. */
export const ACTOR_KINDS = ['user', 'guide', 'system'] as const;
export const actorKindSchema = z.enum(ACTOR_KINDS);
export type ActorKind = z.infer<typeof actorKindSchema>;
