/**
 * Recap command payloads (docs/api-contracts.md §4.14 and doc deltas): opening and finishing the
 * recap (which signs the crew's stamps), the signature stroke, the MVP vote, opting out of an
 * award, and retrying a failed build; reacting to a year-later memory and starting a reunion.
 */
import { z } from 'zod';

export const RECAP_VIEW_KINDS = ['open', 'complete'] as const;

export const recordRecapViewPayloadSchema = z.strictObject({
  recap_id: z.uuid(),
  kind: z.enum(RECAP_VIEW_KINDS),
});
export type RecordRecapViewPayload = z.infer<typeof recordRecapViewPayloadSchema>;

/** The stroke the traveller drew, uploaded as a media object with purpose `signature`. */
export const saveSignaturePayloadSchema = z.strictObject({ media_id: z.uuid() });
export type SaveSignaturePayload = z.infer<typeof saveSignaturePayloadSchema>;

export const castMvpVotePayloadSchema = z.strictObject({
  recap_id: z.uuid(),
  award_id: z.uuid(),
});
export type CastMvpVotePayload = z.infer<typeof castMvpVotePayloadSchema>;

/** `opted_out: false` puts the award back. */
export const optOutAwardPayloadSchema = z.strictObject({
  award_id: z.uuid(),
  opted_out: z.boolean().default(true),
});
export type OptOutAwardPayload = z.infer<typeof optOutAwardPayloadSchema>;

export const retryRecapPayloadSchema = z.strictObject({ trip_id: z.uuid() });
export type RetryRecapPayload = z.infer<typeof retryRecapPayloadSchema>;

/** An emoji, a short line (≤ 40 characters) or both; one reaction per traveller, replaced. */
export const reactMemoryPayloadSchema = z
  .strictObject({
    memory_id: z.uuid(),
    emoji: z.string().min(1).max(16).optional(),
    text: z.string().trim().min(1).max(40).optional(),
  })
  .refine((payload) => payload.emoji !== undefined || payload.text !== undefined, {
    message: 'an emoji or a line',
  });
export type ReactMemoryPayload = z.infer<typeof reactMemoryPayloadSchema>;

export const startReunionPayloadSchema = z.strictObject({ memory_id: z.uuid() });
export type StartReunionPayload = z.infer<typeof startReunionPayloadSchema>;

export interface RecordRecapViewResult {
  readonly recap_id: string;
  /** Stamps this open signed (zero on a repeat open). */
  readonly signed: number;
}

export interface CastMvpVoteResult {
  readonly recap_id: string;
  readonly award_id: string;
  /** True when this vote was the last one and closed the vote. */
  readonly closed: boolean;
}
