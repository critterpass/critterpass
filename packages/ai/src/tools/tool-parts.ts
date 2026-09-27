/**
 * Shared pieces of the tool schemas: id, time and money primitives, the model-facing plan-change
 * op, and the `spec()` helper that keeps each tool's input and output types for `ToolInput<N>` /
 * `ToolOutput<N>`.
 */
import { changeSetOpKindSchema, planItemSnapshotSchema, type AiCaller } from '@cp/domain';
import { z } from 'zod';

export const id = z.uuid();
export const isoDate = z.iso.date();
export const isoInstant = z.iso.datetime({ offset: true });
export const minor = z.number().int();
export const currency = z.string().describe('ISO 4217 code');
export const latLng = z.object({ lat: z.number(), lng: z.number() });
export const tripOnly = z.object({ trip_id: id });
export const draft = z.object({ draft_id: id });
export const alert = z.object({
  kind: z.string(),
  severity: z.string(),
  from: isoInstant,
  to: isoInstant,
});
export const series = <T extends z.ZodRawShape>(point: T) =>
  z.object({ hourly: z.array(z.object({ at: isoInstant, ...point })), alerts: z.array(alert) });
export const forecastInput = z.object({
  lat: z.number(),
  lng: z.number(),
  from: isoInstant,
  to: isoInstant,
});

/** A plan change as the model proposes it; `before`, affected members and booking impact are
 * filled by the planner from the base version, never by the model. */
export const proposedOp = z.object({
  op: changeSetOpKindSchema,
  item: id.optional().describe('stable_id of the item; omitted for add'),
  new: planItemSnapshotSchema
    .pick({
      day_no: true,
      starts_at: true,
      ends_at: true,
      lane: true,
      attendee_ids: true,
      poi_id: true,
      category: true,
      is_outdoor: true,
      notes: true,
    })
    .optional(),
  reason: z.string(),
  source_ids: z.array(z.string()).describe('ids returned by tools that justify the change'),
});
export const costDelta = z.object({ delta_per_person_minor: minor, currency });

export type ToolEffect = 'read' | 'draft';

export interface ToolSpec<I extends z.ZodObject = z.ZodObject, O extends z.ZodType = z.ZodType> {
  readonly description: string;
  readonly callers: readonly AiCaller[];
  readonly effect: ToolEffect;
  readonly input: I;
  readonly output: O;
}

export const spec = <I extends z.ZodObject, O extends z.ZodType>(
  description: string,
  callers: string,
  effect: ToolEffect,
  input: I,
  output: O,
): ToolSpec<I, O> => ({ description, callers: [...callers] as AiCaller[], effect, input, output });
