import { describe, expect, it } from 'vitest';

import {
  avatarChoiceSchema,
  avatarKeyOwner,
  issuePassPayloadSchema,
  ringOfForm,
  startPassPayloadSchema,
} from '../wire';

const UID = '0192a6f0-1111-7000-8000-000000000001';
const KEY = `u/${UID}/avatar/0192a6f0-2222-7000-8000-000000000002`;

describe('avatar wire', () => {
  it('takes a photo by its avatar media key and names the uploader', () => {
    expect(avatarChoiceSchema.parse({ kind: 'photo', media_key: KEY })).toEqual({
      kind: 'photo',
      media_key: KEY,
    });
    expect(avatarKeyOwner(KEY)).toBe(UID);
    expect(avatarKeyOwner(KEY.replace('/avatar/', '/photo/'))).toBeNull();
    expect(avatarChoiceSchema.safeParse({ kind: 'photo', media_key: 'u/x/avatar/y' }).success).toBe(
      false,
    );
  });

  it('rings rare, epic and legendary forms only', () => {
    expect(ringOfForm('cp-012:epic')).toBe('epic');
    expect(ringOfForm('cp-012:common')).toBeNull();
    expect(ringOfForm('guide:tokek')).toBeNull();
  });
});

describe('pass wire', () => {
  it('lets start_pass carry the client pass id, or nothing', () => {
    expect(startPassPayloadSchema.parse({})).toEqual({});
    expect(startPassPayloadSchema.parse({ pass_id: UID })).toEqual({ pass_id: UID });
  });

  it('accepts an offline issue with a guide avatar', () => {
    const parsed = issuePassPayloadSchema.parse({
      pass_id: UID,
      given_name: ' Mai ',
      avatar: { kind: 'critter', form_id: 'guide:pon' },
      taste_answers: [{ q_id: 'q1', value: 'left' }],
      home_iata: 'SGN',
    });
    expect(parsed.given_name).toBe('Mai');
  });
});
