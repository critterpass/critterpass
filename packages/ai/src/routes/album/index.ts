/**
 * Album curation (AI-35). The guide scores the candidate thumbnails (code picks from the scores,
 * so a failed call only means neutral scores), and writes the album's note from the facts about
 * the picks: a note with a number the facts lack, or a claim that everyone is in the picks when
 * they are not, is refused and the template's line stands in.
 */
import type { AlbumNoteFacts } from '@cp/domain';

import type { Gateway } from '../../client';
import type { PersonaId } from '../../persona/schema';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import { allowedNumbersIn, ungroundedRecapNumbers } from '../recap/number-guard';
import {
  ALBUM_NOTE_ROUTE,
  ALBUM_SCORE_ROUTE,
  buildAlbumNoteRequest,
  buildAlbumScoreRequest,
} from './prompt';
import {
  ALBUM_NOTE_MAX,
  ALBUM_SCORE_MAX_PHOTOS,
  albumScoreReplySchema,
  type AlbumThumbnail,
} from './schema';

export * from './prompt';
export * from './schema';

/** The guide's scores by photo id; unknown ids and scores outside 0–10 are dropped. */
export function validAlbumScores(
  reply: unknown,
  photoIds: readonly string[],
): ReadonlyMap<string, number> {
  const parsed = albumScoreReplySchema.safeParse(reply);
  const scores = new Map<string, number>();
  if (!parsed.success) return scores;
  const known = new Set(photoIds);
  for (const { photo_id: id, score } of parsed.data.scores) {
    if (known.has(id) && !scores.has(id) && score >= 0 && score <= 10) scores.set(id, score);
  }
  return scores;
}

export async function scoreAlbumPhotos(
  gateway: Pick<Gateway, 'callModel'>,
  photos: readonly AlbumThumbnail[],
  context: UsageContext = {},
): Promise<ReadonlyMap<string, number>> {
  const batch = photos.slice(0, ALBUM_SCORE_MAX_PHOTOS);
  if (batch.length === 0) return new Map();
  try {
    const result = await gateway.callModel(
      ALBUM_SCORE_ROUTE,
      buildAlbumScoreRequest(batch),
      context,
    );
    if (isDeclined(result.message)) return new Map();
    return validAlbumScores(
      parseStructuredText(textOf(result.message)),
      batch.map((photo) => photo.photo_id),
    );
  } catch {
    return new Map();
  }
}

const EVERYONE =
  /\b(everyone|everybody|all of you|each of you|every one of you|the whole crew)\b/iu;

/** The template note: what the facts say, plainly. */
export function templateAlbumNote(facts: AlbumNoteFacts): string {
  if (facts.picks === 0) return 'Nothing to pick yet. Add some photos and I will take a look.';
  const keepers = `I picked ${facts.picks} ${facts.picks === 1 ? 'keeper' : 'keepers'}.`;
  return facts.everyone_in_three
    ? `${keepers} Nothing blurry, and everyone's in at least 3.`
    : `${keepers} Nothing blurry.`;
}

/** Why a note may not be shown, or null when it may. */
export function albumNoteProblem(note: string, facts: AlbumNoteFacts): string | null {
  if (note.length === 0 || note.length > ALBUM_NOTE_MAX) return 'length';
  const loose = ungroundedRecapNumbers(note, allowedNumbersIn(facts));
  if (loose.length > 0) return `ungrounded:${loose.join(',')}`;
  if (!facts.everyone_in_three && EVERYONE.test(note)) return 'claims_everyone';
  return null;
}

export interface AlbumNoteResult {
  readonly note: string;
  readonly fallbackUsed: boolean;
  readonly rejected?: string;
}

export async function writeAlbumNote(
  gateway: Pick<Gateway, 'callModel'>,
  input: { readonly guide: PersonaId; readonly facts: AlbumNoteFacts },
  context: UsageContext = {},
): Promise<AlbumNoteResult> {
  const fallback = (rejected: string): AlbumNoteResult => ({
    note: templateAlbumNote(input.facts),
    fallbackUsed: true,
    rejected,
  });
  if (input.facts.picks === 0) return fallback('no_picks');
  try {
    const result = await gateway.callModel(
      ALBUM_NOTE_ROUTE,
      buildAlbumNoteRequest(input.guide, input.facts),
      context,
    );
    if (isDeclined(result.message)) return fallback('declined');
    const note = textOf(result.message)
      .trim()
      .replace(/^["“]|["”]$/gu, '')
      .replace(/\s+/gu, ' ');
    const problem = albumNoteProblem(note, input.facts);
    return problem === null ? { note, fallbackUsed: false } : fallback(problem);
  } catch {
    return fallback('call_failed');
  }
}
