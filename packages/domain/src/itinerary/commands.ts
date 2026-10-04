/**
 * Drafting command payloads (docs/api-contracts.md §4.6). A redraft is one day at a time, needs a
 * reason chip or a note, and names the draft version it was asked against so a stale screen gets
 * `VERSION_CONFLICT` rather than a redraft of a day that has since changed.
 */
import { z } from 'zod';

/** The first reason chips; apps built around them send and render exactly these. */
export const REDRAFT_REASONS = [
  'slower',
  'cheaper',
  'less_train',
  'more_food',
  'swap_it_out',
  'surprise_me',
] as const;
export const redraftReasonSchema = z.enum(REDRAFT_REASONS);
export type RedraftReason = z.infer<typeof redraftReasonSchema>;

/**
 * Every reason a redraft accepts: the first chips, plus a later start, a lighter day and less time
 * travelling (which says nothing about trains; `less_train` is read the same way).
 */
export const REDRAFT_REASON_KEYS = [
  ...REDRAFT_REASONS,
  'later_start',
  'lighter_day',
  'less_travel',
] as const;
export const redraftReasonKeySchema = z.enum(REDRAFT_REASON_KEYS);
export type RedraftReasonKey = z.infer<typeof redraftReasonKeySchema>;

/**
 * The reason chips on the change-a-day sheet, in the order they show, each with the catalogue key
 * of its label. `less_train` is no longer offered; a build that still sends it is still accepted.
 */
export const REDRAFT_REASON_CHIPS = [
  { key: 'slower', labelKey: 'planDraft.reason.slower' },
  { key: 'lighter_day', labelKey: 'planDraft.reason.lighterDay' },
  { key: 'later_start', labelKey: 'planDraft.reason.laterStart' },
  { key: 'less_travel', labelKey: 'planDraft.reason.lessTravel' },
  { key: 'cheaper', labelKey: 'planDraft.reason.cheaper' },
  { key: 'more_food', labelKey: 'planDraft.reason.moreFood' },
  { key: 'swap_it_out', labelKey: 'planDraft.reason.swap' },
  { key: 'surprise_me', labelKey: 'planDraft.reason.surprise' },
] as const satisfies readonly { readonly key: RedraftReasonKey; readonly labelKey: string }[];

export const REDRAFT_NOTE_MAX = 280;

export const startDraftPayloadSchema = z.strictObject({ trip_id: z.uuid() });
export type StartDraftPayload = z.infer<typeof startDraftPayloadSchema>;

export const cancelDraftPayloadSchema = z.strictObject({ trip_id: z.uuid() });
export type CancelDraftPayload = z.infer<typeof cancelDraftPayloadSchema>;

export const requestRedraftPayloadSchema = z
  .strictObject({
    trip_id: z.uuid(),
    day: z.number().int().positive(),
    reasons: z.array(redraftReasonKeySchema).max(REDRAFT_REASON_KEYS.length),
    note: z.string().trim().max(REDRAFT_NOTE_MAX).optional(),
    base_version: z.uuid(),
    /** A free redraft that fits in a must-do added after the draft was made. */
    free_reason: z.literal('late_must_do').optional(),
  })
  .refine((p) => p.reasons.length > 0 || (p.note ?? '').length > 0, {
    message: 'a reason chip or a note is needed',
    path: ['reasons'],
  });
export type RequestRedraftPayload = z.infer<typeof requestRedraftPayloadSchema>;

export const keepRedraftPayloadSchema = z.strictObject({
  redraft_id: z.uuid(),
  /** Changes the organiser toggled off: those items stay as they were. */
  excluded_stable_ids: z.array(z.uuid()).max(50).optional(),
});
export type KeepRedraftPayload = z.infer<typeof keepRedraftPayloadSchema>;

export const revertRedraftPayloadSchema = z.strictObject({ redraft_id: z.uuid() });
export type RevertRedraftPayload = z.infer<typeof revertRedraftPayloadSchema>;

export const restoreDraftVersionPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  version_id: z.uuid(),
});
export type RestoreDraftVersionPayload = z.infer<typeof restoreDraftVersionPayloadSchema>;
