/**
 * Deterministic quests from the day itself: used when the guide is not configured, fails, declines
 * or proposes fewer than three valid quests, and on a day with no plan. Every fallback quest goes
 * through the same validator, so a fallback can never publish something the guide could not.
 */
import { templatesForDay, type QuestDay, type QuestTemplateMap } from './templates';
import {
  MIN_DAILY_QUESTS,
  questKey,
  validateQuest,
  type QuestCandidate,
  type ValidQuest,
} from './validator';

const mid = (min: number, max: number): number => Math.round((min + max) / 20) * 10;

function xpOf(templates: QuestTemplateMap, id: string): number {
  const def = templates.get(id);
  return def === undefined ? 0 : mid(def.xp.min, def.xp.max);
}

const upTo = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

/** Candidate fallback quests for the day, most specific first. */
export function fallbackCandidates(day: QuestDay, templates: QuestTemplateMap): QuestCandidate[] {
  const allowed = new Set(templatesForDay(templates, day));
  const out: QuestCandidate[] = [];
  const add = (
    template_id: string,
    params: Record<string, unknown>,
    title: string,
    desc: string,
  ) => {
    if (allowed.has(template_id)) {
      out.push({ template_id, params, title, desc, reward: { xp: xpOf(templates, template_id) } });
    }
  };
  const withPoi = day.items.filter((item) => item.poi_id !== null);
  const early = withPoi.find((item) => item.start !== null && item.start < '10:00');
  if (early?.poi_id != null && early.start !== null) {
    add(
      'early_start',
      { plan_item_id: early.id, by_time: early.start },
      'EARLY BIRDS',
      upTo(`Be at ${early.name} by ${early.start}.`, 110),
    );
  }
  const first = withPoi.find((item) => item !== early);
  if (first?.poi_id != null) {
    add(
      'visit_poi',
      { poi_id: first.poi_id },
      'MAKE IT THERE',
      upTo(`Get to ${first.name} today.`, 110),
    );
  }
  const distinct = [...new Set(withPoi.map((item) => item.poi_id))].filter(
    (id): id is string => id !== null,
  );
  if (distinct.length >= 3) {
    add(
      'visit_any_of',
      { poi_ids: distinct.slice(0, 6), n: 3 },
      'PLACE HOPPERS',
      'Check in at 3 of today’s stops.',
    );
  }
  if (day.lastDay) {
    add('settle_by', { by_time: '21:00' }, 'ZERO DEBT', 'Settle every bill before 21:00 tonight.');
  }
  add('befriend', { n: 1 }, 'NEW FRIEND', 'Befriend 1 local critter today.');
  add('log_expenses', { n: 3 }, 'RECEIPT KEEPERS', 'Log 3 expenses today, as they happen.');
  return out;
}

/**
 * Fills `quests` (already valid) up to three with fallback quests the day allows, skipping any
 * template already used. A day with nothing on the plan still gets the plan-free quests.
 */
export function fillWithFallback(
  quests: readonly ValidQuest[],
  day: QuestDay,
  templates: QuestTemplateMap,
): ValidQuest[] {
  const out = [...quests];
  const used = new Set(out.map((quest) => quest.template));
  const keys = new Set(out.map(questKey));
  for (const candidate of fallbackCandidates(day, templates)) {
    if (out.length >= MIN_DAILY_QUESTS) break;
    if (used.has(candidate.template_id)) continue;
    const verdict = validateQuest(candidate, day, templates);
    if (!verdict.ok || keys.has(questKey(verdict.quest))) continue;
    out.push(verdict.quest);
    used.add(verdict.quest.template);
    keys.add(questKey(verdict.quest));
  }
  return out;
}
