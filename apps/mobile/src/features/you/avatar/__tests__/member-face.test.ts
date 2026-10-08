/**
 * Which face a member wears: crewmates see a photo only once it is approved, its owner sees it
 * while it is checked (never once rejected), guides draw their sticker with any rarity ring, and
 * anything else reads as initials.
 */
import { describe, expect, it } from '@jest/globals';

import { wearsPending } from '../../profile/pending-me';

import { faceOf, type AvatarRow } from '../member-face';

const KEY = 'u/0192f000-0000-7000-8000-0000000000a1/avatar/0192f000-0000-7000-8000-0000000000b2';

function row(over: Partial<AvatarRow>): AvatarRow {
  return {
    user_id: 'maya',
    kind: null,
    form_id: null,
    ring: null,
    media_key: null,
    moderation_status: 'none',
    ...over,
  };
}

describe('faceOf', () => {
  it('shows a photo to crewmates only once it is approved', () => {
    const photo = (status: string) =>
      row({ kind: 'photo', media_key: KEY, moderation_status: status });
    expect(faceOf(photo('approved'), 'leo')).toEqual({ kind: 'photo', mediaKey: KEY });
    expect(faceOf(photo('pending'), 'leo')).toEqual({ kind: 'initials' });
    expect(faceOf(photo('rejected'), 'leo')).toEqual({ kind: 'initials' });
  });

  it('shows its owner their own photo while it is checked, but not once rejected', () => {
    const photo = (status: string) =>
      row({ kind: 'photo', media_key: KEY, moderation_status: status });
    expect(faceOf(photo('pending'), 'maya')).toEqual({ kind: 'photo', mediaKey: KEY });
    expect(faceOf(photo('rejected'), 'maya')).toEqual({ kind: 'initials' });
  });

  it('draws a guide with its ring, keeps other forms for their art, and defaults to initials', () => {
    expect(faceOf(row({ kind: 'critter', form_id: 'guide:tokek', ring: 'rare' }), null)).toEqual({
      kind: 'guide',
      guide: 'tokek',
      ring: 'rare',
    });
    expect(faceOf(row({ kind: 'critter', form_id: 'temple-tokek', ring: 'mythic' }), null)).toEqual(
      {
        kind: 'form',
        formId: 'temple-tokek',
        ring: null,
      },
    );
    expect(faceOf(undefined, null)).toEqual({ kind: 'initials' });
    expect(faceOf(row({ kind: 'initials' }), null)).toEqual({ kind: 'initials' });
  });
});

describe('an avatar picked on this phone', () => {
  it('counts as synced only once the row wears the same thing', () => {
    const critter = { kind: 'critter', form_id: 'form-a', media_key: null };
    expect(wearsPending(undefined, critter)).toBe(false);
    expect(wearsPending({ kind: 'critter', form_id: 'form-b', media_key: null }, critter)).toBe(
      false,
    );
    expect(wearsPending({ ...critter }, critter)).toBe(true);
    const photo = { kind: 'photo', form_id: null, media_key: 'k2' };
    expect(wearsPending({ kind: 'photo', form_id: null, media_key: 'k1' }, photo)).toBe(false);
    expect(wearsPending({ ...photo }, photo)).toBe(true);
  });

  it('reads no avatar row as initials', () => {
    const initials = { kind: 'initials', form_id: null, media_key: null };
    expect(wearsPending(undefined, initials)).toBe(true);
    expect(wearsPending({ kind: null, form_id: null, media_key: null }, initials)).toBe(true);
    expect(wearsPending({ kind: 'critter', form_id: 'form-a', media_key: null }, initials)).toBe(
      false,
    );
  });
});
