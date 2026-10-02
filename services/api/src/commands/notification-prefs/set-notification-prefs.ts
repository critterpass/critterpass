/**
 * `set_notification_prefs` (docs/api-contracts.md §4.1): patches how much the caller is pinged.
 * The daily budget (1–10), the evening roundup's time and zone, quiet hours, the four category
 * switches the router reads (guide tips, money, critters nearby, crew chat mode), per-category
 * mutes and the spoken read-out. Only the fields sent change; the row is created with the product
 * defaults on first use.
 *
 * Categories that carry what always gets through (leave-by, SOS, disruptions) cannot be muted, and
 * turning the spoken read-out on is a Pass+ perk (turning it off never is).
 */
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@cp/domain';
import { z } from 'zod';

import { entitle } from '../../entitlements/entitle';
import { defineCommand } from '../_framework/define-command';

/** `HH:MM`, 24-hour, as the app's time pickers produce it. */
const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Categories of the notifications that always get through: never muted. */
export const UNMUTABLE_CATEGORIES: readonly NotificationCategory[] = [
  'cp.leaveby',
  'cp.sos',
  'cp.disruption',
];

const mutableCategorySchema = z
  .enum(NOTIFICATION_CATEGORIES)
  .refine((category) => !UNMUTABLE_CATEGORIES.includes(category), {
    message: 'this category always gets through',
  });

export const setNotificationPrefsPayloadSchema = z
  .object({
    budget: z.number().int().min(1).max(10),
    roundup_time: clockSchema,
    roundup_tz: z.enum(['trip', 'device']),
    quiet: z.object({ from: clockSchema, to: clockSchema }),
    guide_tips: z.boolean(),
    money: z.boolean(),
    critters_nearby: z.boolean(),
    crew_chat: z.enum(['all', 'mentions', 'off']),
    leave_by_dnd: z.boolean(),
    /** `false` mutes a category; merged key by key into what is stored. */
    per_category: z.partialRecord(mutableCategorySchema, z.boolean()),
    voice_readout: z.boolean(),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'nothing to change' });
export type SetNotificationPrefsPayload = z.infer<typeof setNotificationPrefsPayloadSchema>;

export interface NotificationPrefsResult {
  readonly budget: number;
  readonly roundup_time: string;
  readonly voice_readout: boolean;
}

export const setNotificationPrefsCommand = defineCommand({
  name: 'set_notification_prefs',
  v: 1,
  schema: setNotificationPrefsPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  entitle: async (tx, payload, ctx) => {
    if (payload.voice_readout !== true) return;
    await entitle(
      tx,
      { uid: ctx.uid, deviceTz: ctx.device.tz },
      { kind: 'capability', key: 'spoken_readout' },
    );
  },
  handle: async (tx, payload, ctx): Promise<NotificationPrefsResult> => {
    await tx.query('INSERT INTO notification_prefs (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [
      ctx.uid,
    ]);
    const columns: Record<string, unknown> = {
      budget_per_day: payload.budget,
      roundup_time: payload.roundup_time,
      roundup_tz: payload.roundup_tz,
      quiet_from: payload.quiet?.from,
      quiet_to: payload.quiet?.to,
      guide_tips: payload.guide_tips,
      money: payload.money,
      critters_nearby: payload.critters_nearby,
      crew_chat_mode: payload.crew_chat,
      leave_by_dnd: payload.leave_by_dnd,
      voice_readout: payload.voice_readout,
    };
    const sets: string[] = [];
    const values: unknown[] = [ctx.uid];
    for (const [column, value] of Object.entries(columns)) {
      if (value === undefined) continue;
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    }
    if (payload.per_category !== undefined) {
      values.push(JSON.stringify(payload.per_category));
      sets.push(`per_category = per_category || $${values.length}::jsonb`);
    }
    const { rows } = await tx.query<NotificationPrefsResult>(
      `UPDATE notification_prefs SET ${sets.join(', ')} WHERE user_id = $1
       RETURNING budget_per_day AS budget, to_char(roundup_time, 'HH24:MI') AS roundup_time,
                 voice_readout`,
      values,
    );
    const row = rows[0];
    if (row === undefined) throw new Error('notification_prefs update returned no row');
    return row;
  },
});
