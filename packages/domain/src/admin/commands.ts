/**
 * Wire contracts shared by the api's `/v1/admin/*` routes and the ops console: the signed-in
 * admin, keyset pages, and the command envelope the console sends (`actor.via = 'admin'`).
 */
import { z } from 'zod';

import { commandEnvelopeSchema } from '../commands/envelope';
import { ADMIN_AREAS } from './policy';
import { adminRoleSchema } from './roles';

export const adminMeSchema = z.object({
  uid: z.uuid(),
  email: z.string(),
  name: z.string(),
  roles: z.array(adminRoleSchema),
  areas: z.array(z.enum(ADMIN_AREAS)),
  /** Absolute session end (12 h after sign-in); the console signs out when it passes. */
  session_expires_at: z.iso.datetime({ offset: true }),
});
export type AdminMe = z.infer<typeof adminMeSchema>;

/** Keyset page (docs/api-contracts.md §1 Pagination). */
export function adminPageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({ items: z.array(item), next_cursor: z.string().nullable() });
}

export const adminPageQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().max(200).optional(),
});
export type AdminPageQuery = z.infer<typeof adminPageQuerySchema>;

export const adminCommandEnvelopeSchema = commandEnvelopeSchema(z.unknown()).extend({
  actor: z.object({ uid: z.uuid(), via: z.literal('admin') }),
});
export type AdminCommandEnvelope = z.infer<typeof adminCommandEnvelopeSchema>;

/** The console's fixed device identity in command envelopes. */
export const ADMIN_CONSOLE_DEVICE = {
  id: 'ops-console',
  platform: 'web',
  app_version: '1.0.0',
  tz: 'UTC',
} as const;

export const adminCommandResultSchema = z.object({
  op_id: z.string(),
  status: z.enum(['applied', 'duplicate']),
  result: z.unknown().optional(),
});
export type AdminCommandResult = z.infer<typeof adminCommandResultSchema>;
