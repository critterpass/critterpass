import { describe, expect, it } from '@jest/globals';
import { POSTCARD_NOTE_MAX } from '@cp/domain';

import type { AlbumPhoto } from '../data/album-model';
import {
  initialDraft,
  recipientsOf,
  saveStep,
  type SavedPostcard,
} from '../postcard/postcard-draft';

const TRIP = '00000000-0000-4000-8000-0000000000aa';
const NEW = '00000000-0000-4000-8000-0000000000bb';

const photo = (id: string, isPick: boolean) => ({ id, isPick }) as AlbumPhoto;

describe('postcard draft', () => {
  it('starts from the top pick and the recap note, cut to the format', () => {
    const long = 'x'.repeat(400);
    const draft = initialDraft(null, [photo('a', false), photo('b', true)], long);
    expect(draft.photoId).toBe('b');
    expect(draft.note).toHaveLength(POSTCARD_NOTE_MAX.classic);
  });

  it('creates once, then edits only what changed', () => {
    const draft = { format: 'square' as const, photoId: 'p1', note: ' Hi ' };
    const created = saveStep(TRIP, NEW, null, draft);
    expect(created).toEqual({
      kind: 'create',
      payload: { postcard_id: NEW, trip_id: TRIP, format: 'square', photo_id: 'p1', note: 'Hi' },
    });
    const saved: SavedPostcard = {
      id: NEW,
      format: 'square',
      photoId: 'p1',
      note: 'Hi',
      sentAt: null,
    };
    expect(saveStep(TRIP, 'unused', saved, draft)).toEqual({ kind: 'none' });
    expect(saveStep(TRIP, 'unused', saved, { ...draft, photoId: null })).toEqual({
      kind: 'edit',
      payload: { postcard_id: NEW, patch: { photo_id: null } },
    });
  });

  it('sends to every other traveller', () => {
    expect(recipientsOf([{ id: 'me' }, { id: 'a' }, { id: 'b' }], 'me')).toEqual(['a', 'b']);
  });
});
