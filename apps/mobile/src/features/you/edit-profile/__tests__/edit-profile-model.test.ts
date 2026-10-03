/**
 * Edit profile sends only what changed, refuses what the server would refuse (a bad name, a
 * username that breaks the rules or changed in the last 30 days), and asks the server otherwise.
 */
import { describe, expect, it } from '@jest/globals';

import {
  canSave,
  changesOf,
  draftOf,
  languagesOf,
  usernameLocalState,
  type SavedProfile,
} from '../edit-profile-model';

const NOW = new Date('2026-10-03T09:00:00Z');
const SAVED: SavedProfile = {
  name: 'Winston',
  username: 'winston',
  homeAirport: 'SIN',
  languages: ['en'],
  usernameChangedAt: null,
};

describe('edit profile', () => {
  it('sends nothing until something changes, then only the changed fields', () => {
    const draft = draftOf(SAVED);
    expect(changesOf(SAVED, draft)).toEqual({ profile: null, homeAirport: null });
    expect(changesOf(SAVED, { ...draft, name: ' Win ', homeAirport: 'SGN' })).toEqual({
      profile: { name: 'Win' },
      homeAirport: 'SGN',
    });
    expect(changesOf(SAVED, { ...draft, username: '@Winnie' })).toEqual({
      profile: { username: 'winnie' },
      homeAirport: null,
    });
  });

  it('sends the spoken languages only when the set or its order changes, without repeats', () => {
    const draft = draftOf(SAVED);
    expect(changesOf(SAVED, { ...draft, languages: ['en'] }).profile).toBeNull();
    expect(changesOf(SAVED, { ...draft, languages: ['en', 'vi', 'en'] }).profile).toEqual({
      languages: ['en', 'vi'],
    });
    expect(languagesOf('["en","zh-Hans"]')).toEqual(['en', 'zh-Hans']);
    expect(languagesOf('{en,vi}')).toEqual(['en', 'vi']);
    expect(languagesOf(null)).toEqual([]);
  });

  it('checks the username on the phone first, then leaves it to the server', () => {
    const draft = draftOf(SAVED);
    expect(usernameLocalState(SAVED, draft, NOW)).toEqual({ kind: 'unchanged' });
    expect(usernameLocalState(SAVED, { ...draft, username: 'wi' }, NOW)).toEqual({
      kind: 'invalid',
      reason: 'too_short',
    });
    expect(usernameLocalState(SAVED, { ...draft, username: 'win.ston' }, NOW)).toBeNull();
    const recent = { ...SAVED, usernameChangedAt: '2026-09-20T09:00:00Z' };
    expect(usernameLocalState(recent, { ...draft, username: 'winnie' }, NOW)).toMatchObject({
      kind: 'cooldown',
    });
  });

  it('offers SAVE only for a change with nothing known to be wrong', () => {
    const draft = { ...draftOf(SAVED), name: 'Win' };
    const changes = changesOf(SAVED, draft);
    expect(canSave(changes, draft, { kind: 'unchanged' })).toBe(true);
    expect(canSave(changes, { ...draft, name: '  ' }, { kind: 'unchanged' })).toBe(false);
    expect(canSave(changes, draft, { kind: 'taken' })).toBe(false);
    expect(canSave(changes, draft, { kind: 'unknown' })).toBe(true);
    expect(canSave(changesOf(SAVED, draftOf(SAVED)), draftOf(SAVED), { kind: 'unchanged' })).toBe(
      false,
    );
  });
});
