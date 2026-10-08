/**
 * The composer's draft rules: where a new postcard starts (the guide's top pick and the recap's
 * note), which save a send needs first (create the postcard, or edit only what changed), the note's
 * room per format, and who it goes to (every other traveller on the trip).
 */
import {
  POSTCARD_NOTE_MAX,
  type CreatePostcardPayload,
  type EditPostcardPayload,
} from '@cp/domain';

import type { AlbumPhoto } from '../data/album-model';
import type { PostcardFormat } from './postcard-pair';

export interface PostcardDraft {
  readonly format: PostcardFormat;
  readonly photoId: string | null;
  readonly note: string;
}

export interface SavedPostcard extends PostcardDraft {
  readonly id: string;
  readonly sentAt: string | null;
}

/** The saved postcard, else the top pick (or the first photo) with the recap's note. */
export function initialDraft(
  saved: SavedPostcard | null,
  photos: readonly AlbumPhoto[],
  recapNote: string | null,
): PostcardDraft {
  if (saved !== null) return { format: saved.format, photoId: saved.photoId, note: saved.note };
  const lead = photos.find((photo) => photo.isPick) ?? photos[0] ?? null;
  return {
    format: 'classic',
    photoId: lead?.id ?? null,
    note: clampNote(recapNote ?? '', 'classic'),
  };
}

export function clampNote(note: string, format: PostcardFormat): string {
  return note.slice(0, POSTCARD_NOTE_MAX[format]);
}

export type SaveStep =
  | { readonly kind: 'create'; readonly payload: CreatePostcardPayload }
  | { readonly kind: 'edit'; readonly payload: EditPostcardPayload }
  | { readonly kind: 'none' };

/** What to write before sending: nothing when the saved postcard already says it all. */
export function saveStep(
  tripId: string,
  newId: string,
  saved: SavedPostcard | null,
  draft: PostcardDraft,
): SaveStep {
  const note = clampNote(draft.note.trim(), draft.format);
  if (saved === null) {
    return {
      kind: 'create',
      payload: {
        postcard_id: newId,
        trip_id: tripId,
        format: draft.format,
        photo_id: draft.photoId,
        note,
      },
    };
  }
  const patch: { format?: PostcardFormat; photo_id?: string | null; note?: string } = {};
  if (saved.format !== draft.format) patch.format = draft.format;
  if (saved.photoId !== draft.photoId) patch.photo_id = draft.photoId;
  if (saved.note !== note) patch.note = note;
  return Object.keys(patch).length === 0
    ? { kind: 'none' }
    : { kind: 'edit', payload: { postcard_id: saved.id, patch } };
}

/**
 * What to write when the composer is closed: the traveller's changes, so "Done" never drops them.
 * A postcard nobody touched is not created just by looking at it.
 */
export function closeStep(
  tripId: string,
  newId: string,
  saved: SavedPostcard | null,
  start: PostcardDraft,
  draft: PostcardDraft,
): SaveStep {
  const untouched =
    start.format === draft.format && start.photoId === draft.photoId && start.note === draft.note;
  if (saved === null && untouched) return { kind: 'none' };
  return saveStep(tripId, newId, saved, draft);
}

export function recipientsOf(
  people: readonly { readonly id: string }[],
  me: string | null,
): string[] {
  return people.map((person) => person.id).filter((id) => id !== me);
}
