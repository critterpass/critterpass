/**
 * Trip setup, must-dos (docs/api-contracts.md §4.5): one primary per member plus optional extras,
 * a place from the catalogue or the member's own words, and the lottery / book-ahead reminders the
 * guide sets for them (it never enters or books on their behalf).
 */
import { z } from 'zod';

export const MUST_DO_TITLE_MAX = 120;
export const MUST_DOS_PER_MEMBER = 5;
/** A member who has not added a must-do a day after the prompt gets one nudge. */
export const MUST_DO_NUDGE_HOURS = 24;

const itemSchema = z
  .strictObject({
    /** Client id, so an offline add lands on one row. */
    id: z.uuid().optional(),
    poi_id: z.uuid().optional(),
    /** The member's own words (freeform), or the place's name as shown. */
    text: z.string().trim().min(1).max(MUST_DO_TITLE_MAX),
    /** 0 = their one primary must-do. */
    priority: z.int().min(0).max(9),
  })
  .strict();

export const setMustDosPayloadSchema = z
  .strictObject({
    trip_id: z.uuid(),
    /** The member's whole list; anything of theirs not in it is removed. */
    items: z.array(itemSchema).max(MUST_DOS_PER_MEMBER),
  })
  .refine((p) => p.items.filter((item) => item.priority === 0).length <= 1, {
    message: 'one primary must-do',
    path: ['items'],
  });
export type SetMustDosPayload = z.infer<typeof setMustDosPayloadSchema>;

export const trackLotteryPayloadSchema = z
  .strictObject({
    must_do_id: z.uuid(),
    /** When entries close. */
    deadline: z.iso.date(),
    /** When results come out, when known. */
    result_date: z.iso.date().optional(),
  })
  .refine((p) => p.result_date === undefined || p.result_date >= p.deadline, {
    message: 'results after the deadline',
    path: ['result_date'],
  });
export type TrackLotteryPayload = z.infer<typeof trackLotteryPayloadSchema>;

export interface MustDoResult {
  readonly trip_id: string;
  readonly must_do_ids: readonly string[];
}
