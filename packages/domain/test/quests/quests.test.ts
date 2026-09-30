import { describe, expect, it } from 'vitest';

import {
  BUILTIN_QUEST_TEMPLATES,
  crewLevel,
  fallbackCandidates,
  fillWithFallback,
  MIN_DAILY_QUESTS,
  stickerLevelsBetween,
  templateMap,
  templatesForDay,
  validateQuest,
  validateQuestList,
  xpForNextLevel,
  type QuestCandidate,
  type QuestDay,
} from '../../src';

const BA_NA = '0199a0f2-0000-7000-8000-00000000b0a1';
const MARBLE = '0199a0f2-0000-7000-8000-00000000b0a2';
const MY_KHE = '0199a0f2-0000-7000-8000-00000000b0a3';
const HAN_MARKET = '0199a0f2-0000-7000-8000-00000000b0a4';
const ITEM_BA_NA = '0199a0f2-0000-7000-8000-0000000017e1';
const LEGENDARY = '0199a0f2-0000-7000-8000-00000000f0f0';

const templates = templateMap(BUILTIN_QUEST_TEMPLATES);

function day(changes: Partial<QuestDay> = {}): QuestDay {
  return {
    localDate: '2026-10-03',
    tz: 'Asia/Ho_Chi_Minh',
    travellers: 4,
    visitConsent: true,
    items: [
      { id: ITEM_BA_NA, poi_id: BA_NA, name: 'Ba Na Hills', start: '07:30', category: 'sight' },
      { id: 'i2', poi_id: MARBLE, name: 'Marble Mountains', start: '13:00', category: 'sight' },
      { id: 'i3', poi_id: MY_KHE, name: 'My Khe Beach', start: '16:30', category: 'beach' },
      { id: 'i4', poi_id: HAN_MARKET, name: 'Han Market', start: '19:00', category: 'food' },
    ],
    expenseCategories: ['food', 'transport', 'stay', 'activities'],
    critterSets: ['vn-danang'],
    copresenceForms: { [BA_NA]: LEGENDARY },
    openBalance: true,
    lastDay: false,
    ...changes,
  };
}

const quest = (changes: Partial<QuestCandidate>): QuestCandidate => ({
  template_id: 'visit_poi',
  params: { poi_id: BA_NA },
  title: 'CLOUD WALKERS',
  desc: 'Make it up Ba Na Hills today.',
  reward: { xp: 60 },
  ...changes,
});

describe('crew levels', () => {
  it('matches the designed bar: level 7 takes 1000 XP and level 8 unlocks a sticker', () => {
    let floor = 0;
    for (let level = 1; level < 7; level += 1) floor += xpForNextLevel(level);
    const seven = crewLevel(floor + 640);
    expect(seven).toEqual({ level: 7, into: 640, need: 1000, nextStickerLevel: 8 });
  });

  it('starts a new crew at level 1 with 400 XP to go', () => {
    expect(crewLevel(0)).toMatchObject({ level: 1, into: 0, need: 400, nextStickerLevel: 2 });
    expect(crewLevel(399).level).toBe(1);
    expect(crewLevel(400).level).toBe(2);
  });

  it('lists each sticker level crossed exactly once', () => {
    expect(stickerLevelsBetween(1, 2)).toEqual([2]);
    expect(stickerLevelsBetween(2, 2)).toEqual([]);
    expect(stickerLevelsBetween(3, 8)).toEqual([4, 6, 8]);
  });
});

describe('validateQuest', () => {
  it('publishes a plan quest with the target and reward extras from code', () => {
    const verdict = validateQuest(
      quest({
        template_id: 'copresence',
        params: { poi_id: BA_NA, by_time: '09:00' },
        title: 'SUMMIT SQUAD',
        desc: 'All 4 of you at Ba Na Hills by 09:00.',
        reward: { xp: 150 },
      }),
      day(),
      templates,
    );
    expect(verdict.ok && verdict.quest).toMatchObject({
      target: 4,
      deadline: '09:00',
      reward: { xp: 150, sticker: null, form_id: LEGENDARY },
    });
  });

  it('rejects a POI that is not on the day plan', () => {
    const verdict = validateQuest(
      quest({ params: { poi_id: '0199a0f2-0000-7000-8000-0000000fffff' } }),
      day(),
      templates,
    );
    expect(verdict).toEqual({ ok: false, reason: 'poi_not_in_plan:visit_poi' });
  });

  it('rejects targets and XP outside the template bounds', () => {
    const many = quest({ template_id: 'log_expenses', params: { n: 40 }, desc: 'Log 40.' });
    expect(validateQuest(many, day(), templates)).toMatchObject({ ok: false });
    const rich = quest({ reward: { xp: 5000 } });
    expect(validateQuest(rich, day(), templates)).toEqual({
      ok: false,
      reason: 'xp_out_of_table:visit_poi',
    });
    const unreachable = quest({
      template_id: 'visit_any_of',
      params: { poi_ids: [BA_NA, MARBLE], n: 3 },
      desc: 'Check in at 3 places.',
    });
    expect(validateQuest(unreachable, day(), templates)).toMatchObject({ ok: false });
  });

  it('rejects a number the quest facts do not hold', () => {
    const verdict = validateQuest(
      quest({ desc: 'Make it up Ba Na Hills before 06:00.' }),
      day(),
      templates,
    );
    expect(verdict).toEqual({ ok: false, reason: 'ungrounded:06:00' });
  });

  it('leaves visit quests out when nobody shares visits, and crew quests out when solo', () => {
    expect(validateQuest(quest({}), day({ visitConsent: false }), templates)).toEqual({
      ok: false,
      reason: 'not_today:visit_poi',
    });
    const solo = templatesForDay(templates, day({ travellers: 1 }));
    expect(solo).not.toContain('copresence');
    expect(solo).not.toContain('settle_by');
    expect(solo).toContain('log_expenses');
  });

  it('rejects an early start set after the item begins', () => {
    const late = quest({
      template_id: 'early_start',
      params: { plan_item_id: ITEM_BA_NA, by_time: '08:00' },
      desc: 'Be at Ba Na Hills by 08:00.',
    });
    expect(validateQuest(late, day(), templates)).toMatchObject({ ok: false });
  });

  it('drops repeats and keeps at most four quests', () => {
    const list = validateQuestList(
      [
        quest({}),
        quest({}),
        quest({ template_id: 'befriend', params: { n: 1 }, desc: 'Befriend 1 local.' }),
        quest({ template_id: 'log_expenses', params: { n: 2 }, desc: 'Log 2 expenses.' }),
        quest({
          template_id: 'settle_by',
          params: { by_time: '21:00' },
          desc: 'Square by 21:00.',
          reward: { xp: 120 },
        }),
        quest({ template_id: 'unknown', params: {} }),
        quest({ params: { poi_id: MY_KHE }, desc: 'Get to My Khe Beach.' }),
      ],
      day(),
      templates,
    );
    expect(list.quests).toHaveLength(4);
    expect(list.rejected).toEqual(['repeated:visit_poi', 'unknown_template:unknown', 'too_many']);
  });
});

describe('fallback quests', () => {
  it('fills a plan day to three valid quests', () => {
    const quests = fillWithFallback([], day(), templates);
    expect(quests).toHaveLength(MIN_DAILY_QUESTS);
    expect(quests.map((q) => q.template)).toEqual(['early_start', 'visit_poi', 'visit_any_of']);
  });

  it('never repeats a template the guide already used', () => {
    const guide = validateQuestList([quest({})], day(), templates).quests;
    const quests = fillWithFallback(guide, day(), templates);
    expect(quests.filter((q) => q.template === 'visit_poi')).toHaveLength(1);
    expect(quests).toHaveLength(3);
  });

  it('gives a day with no plan the plan-free quests', () => {
    const quests = fillWithFallback([], day({ items: [], visitConsent: false }), templates);
    expect(quests.map((q) => q.template)).toEqual(['befriend', 'log_expenses']);
  });

  it('always yields at least one quest, even solo with no plan and no critters', () => {
    const bare = day({ items: [], travellers: 1, visitConsent: false, critterSets: [] });
    expect(fillWithFallback([], bare, templates).length).toBeGreaterThanOrEqual(1);
  });

  it('offers settling up on the last day when money is open', () => {
    const ids = fallbackCandidates(day({ lastDay: true }), templates).map((c) => c.template_id);
    expect(ids).toContain('settle_by');
    const settled = day({ lastDay: true, openBalance: false });
    expect(fillWithFallback([], settled, templates).map((q) => q.template)).not.toContain(
      'settle_by',
    );
  });
});
