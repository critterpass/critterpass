/** The line under the invite ticket: who is in, for one member and for several, EN and VI. */

import { afterAll, describe, expect, it } from '@jest/globals';

import { setLocale } from '@/lib/i18n/set-locale';

import { membersLine } from '../InviteTicket';
import type { TicketModel } from '../ticket-model';

function model(names: readonly string[], waiting = 0): TicketModel {
  return {
    members: names.map((name) => ({ name, colour: null })),
    waiting,
  } as unknown as TicketModel;
}

afterAll(async () => {
  await setLocale('en', { persist: false });
});

describe('who is in, under the invite ticket', () => {
  it('says one member is in and several are in', async () => {
    await setLocale('en', { persist: false });
    expect(membersLine(model(['Winston']), 'en')).toBe('Winston is in.');
    expect(membersLine(model(['Winston', 'Maya']), 'en')).toBe('Winston and Maya are in.');
    expect(membersLine(model(['Winston', 'Maya', 'Alex']), 'en')).toBe(
      'Winston, Maya, and Alex are in.',
    );
  });

  it('adds the seats still waiting, and stands alone when nobody is in yet', async () => {
    await setLocale('en', { persist: false });
    expect(membersLine(model(['Winston'], 2), 'en')).toBe(
      'Winston is in. 2 more invited, not in yet.',
    );
    expect(membersLine(model([], 1), 'en')).toBe('1 more invited, not in yet.');
    expect(membersLine(model([]), 'en')).toBe('');
  });

  it('reads the same for every count in Vietnamese', async () => {
    await setLocale('vi', { persist: false });
    expect(membersLine(model(['Winston']), 'vi')).toBe('Winston đã vào.');
    expect(membersLine(model(['Winston', 'Maya']), 'vi')).toBe('Winston và Maya đã vào.');
  });
});
