/**
 * Change review commands (docs/api-contracts.md §4.6): a member drafts a change set against the
 * current plan, toggles its changes on the review screen, sends it to the crew as an approval vote
 * (or applies it to their own plan only), and the affected members approve or reject it from the
 * app, the chat card, the push or the widget. Every approval path runs `approve_changeset`.
 */
import { z } from 'zod';

import { changeSetTriggerSchema } from '../enums/plan';
import { pollDeciderPolicySchema } from '../polls/kinds';
import { changeSetOpsSchema } from './change-set-ops';

export const CHANGESET_SOURCES = ['user', 'guide_suggestion'] as const;

export const createChangesetPayloadSchema = z.object({
  /** Client-chosen id, so the optimistic review card and the synced row are one change set. */
  changeset_id: z.uuid().optional(),
  trip_id: z.uuid(),
  base_version: z.uuid(),
  ops: changeSetOpsSchema.max(50),
  source: z.enum(CHANGESET_SOURCES).default('user'),
  trigger: changeSetTriggerSchema.default('manual'),
});
export type CreateChangesetPayload = z.infer<typeof createChangesetPayloadSchema>;

export const setChangesetItemPayloadSchema = z.object({
  changeset_id: z.uuid(),
  /** The change's target `stable_id`. */
  change_id: z.uuid(),
  accepted: z.boolean(),
});

export const sendChangesetPayloadSchema = z.object({
  changeset_id: z.uuid(),
  /** Yes votes needed; setting it asks for `threshold_n` instead of the default policy. */
  threshold: z.number().int().min(1).max(50).optional(),
  policy: pollDeciderPolicySchema.optional(),
});

export const CHANGESET_DECISIONS = ['yes', 'no'] as const;
export const approveChangesetPayloadSchema = z.object({
  changeset_id: z.uuid(),
  decision: z.enum(CHANGESET_DECISIONS),
});
export type ChangesetDecision = (typeof CHANGESET_DECISIONS)[number];

export const CHANGESET_APPLY_SCOPES = ['group', 'personal'] as const;
export const applyChangesetPayloadSchema = z.object({
  changeset_id: z.uuid(),
  scope: z.enum(CHANGESET_APPLY_SCOPES),
});

/** Where a change set stands after a command, as every surface shows it. */
export interface ChangesetOutcome {
  readonly change_set_id: string;
  readonly status: string;
  readonly poll_id: string | null;
  readonly yes: number;
  readonly no: number;
  readonly needed: number;
  readonly eligible: number;
  readonly result_version_id: string | null;
}
