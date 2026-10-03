/**
 * Realtime on `recap:{recap_id}` and `memory:{memory_id}` (docs/api-contracts-async.md §1): a
 * traveller's signature writing itself on the crew's stamps, the MVP tallies as votes land, the
 * MVP result when the vote closes, and memory reactions popping in.
 */
import { z } from 'zod';

export const RECAP_RT = {
  signature: 'signature',
  mvpVote: 'mvp.vote',
  mvpResult: 'mvp.result',
  reaction: 'reaction',
} as const;

export const recapSignatureDataSchema = z.object({
  signer_id: z.uuid(),
  stroke_media_key: z.string().nullable(),
  signed_at: z.string(),
});

const tallySchema = z.object({ award_id: z.uuid(), votes: z.int().min(0) });

export const recapMvpVoteDataSchema = z.object({
  tallies: z.array(tallySchema),
  voters: z.int().min(0),
  viewers: z.int().min(1),
});

/** The winning award ids (a tie shares the MVP). */
export const recapMvpResultDataSchema = z.object({
  award_ids: z.array(z.uuid()),
  tallies: z.array(tallySchema),
});

export const memoryReactionDataSchema = z.object({
  user_id: z.uuid(),
  emoji: z.string().nullable(),
  text: z.string().nullable(),
});
