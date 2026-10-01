import { describe, expect, it } from '@jest/globals';

import { guideTextSourceHash } from '@cp/domain';

import { guideText } from '@/lib/i18n/guide-text';

import { buildQuestsModel, type QuestRow, type QuestsInput } from '../quests-model';

const TZ = 'Asia/Ho_Chi_Minh';
// 09:00 on Oct 3 in Đà Nẵng.
const NOW = new Date('2026-10-03T02:00:00Z');

function quest(slot: number, changes: Partial<QuestRow> = {}): QuestRow {
  return {
    id: `q${slot}`,
    local_date: '2026-10-03',
    slot,
    template: 'log_expenses',
    params: '{"n":3}',
    target: 3,
    reward: '{"xp":90,"sticker":null,"form_id":null}',
    title: 'Receipt run',
    body: 'Log 3 expenses today.',
    scope: 'crew',
    status: 'active',
    ends_at: '2026-10-03T17:00:00Z',
    reveal_at: null,
    i18n: null,
    ...changes,
  };
}

function input(changes: Partial<QuestsInput> = {}): QuestsInput {
  return {
    loaded: true,
    trip: { startDate: '2026-10-02', endDate: '2026-10-04', tz: TZ },
    crewXp: 0,
    quests: [],
    progress: [],
    signups: [],
    members: [
      { userId: 'u1', name: 'Maya', joinIndex: 0 },
      { userId: 'u2', name: 'Rin', joinIndex: 1 },
      { userId: 'u3', name: 'Dev', joinIndex: 2 },
    ],
    unsettled: [],
    viewerId: 'u1',
    now: NOW,
    ...changes,
  };
}

describe('crew quests model', () => {
  it('says the guide is writing on a trip day with no quests yet, and when the trip is not on', () => {
    expect(buildQuestsModel(input()).state).toBe('writing');
    const early = input({ trip: { startDate: '2026-10-05', endDate: '2026-10-07', tz: TZ } });
    expect(buildQuestsModel(early).state).toBe('before');
    const over = input({ trip: { startDate: '2026-09-20', endDate: '2026-09-25', tz: TZ } });
    expect(buildQuestsModel(over).state).toBe('over');
    expect(buildQuestsModel(input({ loaded: false })).state).toBe('loading');
  });

  it("shows only the trip's local day, in slot order, with the design's colours", () => {
    const model = buildQuestsModel(
      input({ quests: [quest(1), quest(0), quest(0, { id: 'old', local_date: '2026-10-02' })] }),
    );
    expect(model.cards.map((card) => [card.id, card.colour])).toEqual([
      ['q0', 'yellow'],
      ['q1', 'pink'],
    ]);
  });

  it('fills pips from synced progress, never past the count, and full once done', () => {
    const model = buildQuestsModel(
      input({
        quests: [quest(0), quest(1, { status: 'completed' })],
        progress: [
          { quest_id: 'q0', value: 5, counted: null },
          { quest_id: 'q1', value: 1, counted: null },
        ],
      }),
    );
    expect(model.cards.map((card) => card.progress)).toEqual([
      { done: 3, total: 3 },
      { done: 3, total: 3 },
    ]);
    expect(model.cards[1]?.state).toBe('done');
    expect(model.live).toBe(1);
  });

  it('marks a quest missed once its deadline passes, even before the server expires it', () => {
    const model = buildQuestsModel(
      input({ quests: [quest(0, { ends_at: '2026-10-03T01:30:00Z' })] }),
    );
    expect(model.cards[0]?.state).toBe('missed');
    expect(model.live).toBe(0);
  });

  it('shows the faces of who has made it for an all-hands quest', () => {
    const model = buildQuestsModel(
      input({
        quests: [
          quest(0, {
            template: 'copresence',
            reward: '{"xp":150,"sticker":null,"form_id":"f1"}',
            target: 3,
          }),
        ],
        progress: [{ quest_id: 'q0', value: 2, counted: '["u2","u1"]' }],
      }),
    );
    const card = model.cards[0];
    expect(card?.progress).toBeNull();
    expect(card?.people?.map((person) => [person.name, person.done])).toEqual([
      ['Maya', true],
      ['Rin', true],
      ['Dev', false],
    ]);
    expect(card?.reward).toEqual({ xp: 150, kind: 'critter' });
    expect(card?.icon).toBe('critter');
  });

  it('names the Settled Tokek reward, and the XP one otherwise', () => {
    const model = buildQuestsModel(
      input({
        quests: [
          quest(0, { template: 'settle_by', reward: '{"xp":120,"sticker":"settled"}' }),
          quest(1, { params: '{"category":"food","n":2}' }),
        ],
      }),
    );
    expect(model.cards.map((card) => [card.reward.kind, card.icon])).toEqual([
      ['settled', 'wallet'],
      ['xp', 'food'],
    ]);
  });

  it('shows settling up as one pip per traveller, lit once they are square', () => {
    const settle = quest(0, {
      template: 'settle_by',
      target: 1,
      reward: '{"xp":120,"sticker":"settled"}',
    });
    const open = buildQuestsModel(input({ quests: [settle], unsettled: ['u3', 'someone-else'] }));
    expect(open.cards[0]?.progress).toEqual({ done: 2, total: 3 });
    const done = buildQuestsModel(
      input({ quests: [{ ...settle, status: 'completed' }], unsettled: ['u3'] }),
    );
    expect(done.cards[0]?.progress).toEqual({ done: 3, total: 3 });
  });

  it('knows whether the viewer joined an optional quest', () => {
    const model = buildQuestsModel(
      input({
        quests: [quest(0, { scope: 'optional' }), quest(1, { scope: 'optional' })],
        signups: [{ quest_id: 'q1', user_id: 'u1' }],
      }),
    );
    expect(model.cards.map((card) => [card.optional, card.signedUp])).toEqual([
      [true, false],
      [true, true],
    ]);
  });

  it('reads the crew level from the crew XP', () => {
    expect(buildQuestsModel(input({ crewXp: 4540 })).level).toMatchObject({
      level: 7,
      into: 640,
      need: 1000,
      nextStickerLevel: 8,
    });
  });

  describe("in the reader's language", () => {
    const VI = { title: 'Chạy hóa đơn', body: 'Ghi 3 khoản chi hôm nay.' };
    const source = quest(0);
    const row = quest(0, {
      i18n: JSON.stringify({
        vi: VI,
        _src: guideTextSourceHash('quest', { title: source.title, body: source.body }),
      }),
    });
    const reading = (locale: string, rows: readonly QuestRow[]) =>
      buildQuestsModel(
        input({
          quests: rows,
          text: (r, field) =>
            guideText('quest', { title: r.title, body: r.body, i18n: r.i18n }, field, locale),
        }),
      ).cards[0];

    it('shows the Vietnamese quest to a Vietnamese app and the English one to an English app', () => {
      expect(reading('vi', [row])).toMatchObject(VI);
      expect(reading('en', [row])).toMatchObject({ title: source.title, body: source.body });
    });

    it('falls back to the text as stored once the title changed after translation', () => {
      const edited = { ...row, title: 'Receipt sprint' };
      expect(reading('vi', [edited])).toMatchObject({ title: 'Receipt sprint', body: source.body });
    });

    it('shows the text as stored for a language with no translation yet', () => {
      expect(reading('ja', [row])).toMatchObject({ title: source.title, body: source.body });
    });
  });
});
