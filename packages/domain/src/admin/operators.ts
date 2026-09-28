/**
 * Operator management contracts (docs/api-contracts.md §4.17, §5.9): the owner's operators list —
 * console accounts with their last console sign-in and live console sessions, plus allow-listed
 * e-mails that have never signed in — and `revoke_admin_sessions`.
 */
import { z } from 'zod';

import { operatorSchema } from './audit';
import { adminRoleSchema } from './roles';

export const consoleOperatorSchema = operatorSchema.extend({
  /** Newest console session's start; null when they never signed in to the console. */
  last_console_sign_in_at: z.iso.datetime({ offset: true }).nullable(),
  /** Console sessions still live (app sessions are never counted). */
  console_sessions: z.number().int().nonnegative(),
});
export type ConsoleOperator = z.infer<typeof consoleOperatorSchema>;

export const invitedOperatorSchema = z.object({
  email: z.string(),
  /** The roles the allow-list seeds on first sign-in. */
  roles: z.array(adminRoleSchema),
  last_console_sign_in_at: z.null(),
});
export type InvitedOperator = z.infer<typeof invitedOperatorSchema>;

export const consoleOperatorsResponseSchema = z.object({
  items: z.array(consoleOperatorSchema),
  invited: z.array(invitedOperatorSchema),
});
export type ConsoleOperators = z.infer<typeof consoleOperatorsResponseSchema>;

export const revokeAdminSessionsPayloadSchema = z
  .object({ uid: z.uuid(), reason: z.string().trim().min(3).max(500) })
  .strict();
export type RevokeAdminSessionsPayload = z.infer<typeof revokeAdminSessionsPayloadSchema>;
