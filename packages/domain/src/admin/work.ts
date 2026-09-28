/**
 * The console's one assignment model and one counts poll (docs/api-contracts.md §5.9). Each queue
 * with assignable items (desk tasks, moderation reports, later feedback, vendor tasks, ...)
 * registers a work source on the api; `GET /v1/admin/work` lists the caller's items by urgency,
 * `/work/available` the unclaimed items of the areas their roles open, and `/counts` one badge per
 * openable area, polled every 20 s.
 */
import { z } from 'zod';

import { ADMIN_AREAS, type AdminArea } from './policy';

/** Due within this many hours counts as "due soon" (and turns a badge `warn`). */
export const WORK_DUE_SOON_HOURS = 2;
/** How often the console polls `/v1/admin/counts`. */
export const ADMIN_COUNTS_POLL_SECONDS = 20;
/** "Done today" counts from local midnight in the ops team's zone. */
export const OPS_TIME_ZONE = 'Asia/Singapore';

const queueName = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, 'snake_case queue');

export const workItemRefSchema = z.object({ queue: queueName, item_id: z.uuid() }).strict();
export type WorkItemRef = z.infer<typeof workItemRefSchema>;
export const claimWorkItemPayloadSchema = workItemRefSchema;
export const releaseWorkItemPayloadSchema = workItemRefSchema;

export const workItemSchema = z.object({
  queue: z.string(),
  item_id: z.uuid(),
  area: z.enum(ADMIN_AREAS),
  title: z.string(),
  due_at: z.iso.datetime({ offset: true }).nullable(),
  /** The operator holding it (uid), or null when unclaimed. */
  holder: z.uuid().nullable(),
});
export type WorkItem = z.infer<typeof workItemSchema>;

export const workMineSchema = z.object({
  overdue: z.array(workItemSchema),
  due_soon: z.array(workItemSchema),
  later: z.array(workItemSchema),
  /** Items this operator closed since local midnight (Asia/Singapore). */
  done_today: z.number().int().nonnegative(),
});
export type WorkMine = z.infer<typeof workMineSchema>;

export const workAvailableSchema = z.object({ items: z.array(workItemSchema) });

export const COUNT_TONES = ['urgent', 'warn', 'plain'] as const;
export type CountTone = (typeof COUNT_TONES)[number];
export const areaCountSchema = z.object({
  count: z.number().int().nonnegative(),
  tone: z.enum(COUNT_TONES),
});
export type AreaCount = z.infer<typeof areaCountSchema>;
export const adminCountsSchema = z.partialRecord(z.enum(ADMIN_AREAS), areaCountSchema);
export type AdminCounts = Partial<Record<AdminArea, AreaCount>>;

type Dated = { readonly due_at: string | null };

function dueTime(item: Dated): number {
  return item.due_at === null ? Number.POSITIVE_INFINITY : Date.parse(item.due_at);
}

/** Soonest due first; undated items last. */
export function byDue<T extends Dated>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => dueTime(a) - dueTime(b));
}

/** Splits the caller's items into overdue, due within two hours and later, each soonest first. */
export function bucketWork<T extends Dated>(
  items: readonly T[],
  now: Date,
): { overdue: T[]; due_soon: T[]; later: T[] } {
  const soon = now.getTime() + WORK_DUE_SOON_HOURS * 3_600_000;
  const sorted = byDue(items);
  return {
    overdue: sorted.filter((item) => dueTime(item) < now.getTime()),
    due_soon: sorted.filter((item) => dueTime(item) >= now.getTime() && dueTime(item) <= soon),
    later: sorted.filter((item) => dueTime(item) > soon),
  };
}

/** A badge: urgent when anything is overdue, warn when anything is due soon, else plain. */
export function countTone(items: readonly Dated[], now: Date): AreaCount {
  const buckets = bucketWork(items, now);
  const tone: CountTone =
    buckets.overdue.length > 0 ? 'urgent' : buckets.due_soon.length > 0 ? 'warn' : 'plain';
  return { count: items.length, tone };
}
