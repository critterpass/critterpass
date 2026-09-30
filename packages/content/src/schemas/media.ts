/**
 * `media` release items: one licensed photo or video loop proposed for a destination or place,
 * with its source, licence and credit. The shape lives in `@cp/domain` beside the read model.
 */
import { mediaCandidateSchema, type MediaCandidate } from '@cp/domain';

export const mediaItemSchema = mediaCandidateSchema;
export type MediaItem = MediaCandidate;
