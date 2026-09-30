/**
 * Human hand-offs and entry reminders (docs/api-contracts.md §4.11, 3k-10, 3c-7, 3c-9).
 *
 * - `request_concierge`: a traveller hands the ops desk a clinic call, a vendor or anything else; a
 *   person picks it up. The guide never phones anyone. For a clinic the answer says whether the
 *   traveller has insurance on file to share (only ever with their consent, through
 *   `share_insurance`).
 * - `set_entry_reminder`: a lottery or ballot the crew wants (Ghibli Museum, Kyoto Gion seats): each
 *   participant is reminded before entries close and when results come out, with the official
 *   link. We never enter anyone.
 */
import { z } from 'zod';

import type { DeskHours } from '../vendor-comms/draft';

export const CONCIERGE_REQUEST_KINDS = ['clinic', 'vendor', 'other'] as const;
export type ConciergeRequestKind = (typeof CONCIERGE_REQUEST_KINDS)[number];

/** The desk task kind each request becomes. */
export const CONCIERGE_TASK_KIND_OF = {
  clinic: 'clinic_handoff',
  vendor: 'vendor_message',
  other: 'other',
} as const satisfies Record<ConciergeRequestKind, string>;

/** Minutes the desk has to pick a request up while staffed; a clinic call is urgent. */
export const CONCIERGE_SLA_MIN: Readonly<Record<ConciergeRequestKind, number>> = {
  clinic: 10,
  vendor: 30,
  other: 60,
};

export const requestConciergePayloadSchema = z
  .object({
    /** The task id the app chose, so a replay answers the same task. */
    task_id: z.uuid(),
    trip_id: z.uuid(),
    kind: z.enum(CONCIERGE_REQUEST_KINDS),
    text: z.string().trim().min(1).max(1000),
  })
  .strict();
export type RequestConciergePayload = z.infer<typeof requestConciergePayloadSchema>;

export interface RequestConciergeResult {
  readonly task_id: string;
  readonly kind: ConciergeRequestKind;
  readonly due_at: string;
  /** False outside staffed hours: the card says when the desk answers. */
  readonly desk_open: boolean;
  readonly desk_hours: DeskHours;
  /** Clinic only: whether a policy is on file and sharing it was already consented to. */
  readonly insurance: { readonly on_file: boolean; readonly consented: boolean } | null;
}

/** Reminded this long before entries close. */
export const ENTRY_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

export const setEntryReminderPayloadSchema = z
  .object({
    trip_id: z.uuid(),
    must_do_id: z.uuid(),
    closes_at: z.iso.datetime({ offset: true }),
    results_at: z.iso.datetime({ offset: true }).optional(),
    /** The official entry page; every participant enters there themselves. */
    url: z.url({ protocol: /^https$/ }).max(2000),
  })
  .strict()
  .refine(
    (p) => p.results_at === undefined || Date.parse(p.results_at) >= Date.parse(p.closes_at),
    {
      message: 'results after entries close',
      path: ['results_at'],
    },
  );
export type SetEntryReminderPayload = z.infer<typeof setEntryReminderPayloadSchema>;

export interface SetEntryReminderResult {
  readonly must_do_id: string;
  /** Participants reminded (each once per slot, however often this is repeated). */
  readonly participants: number;
  readonly remind_at: string;
  readonly results_at: string | null;
}
