/**
 * The quest validator: the only way a proposed quest (the guide's or the fallback's) becomes one a
 * crew sees. The template must exist and suit the day, its params must resolve against today's plan,
 * the XP must sit inside the template's table, and every number the guide wrote in the title or the
 * line must be one of the quest's own facts. The target and any sticker or critter reward come from
 * code. An item that fails any check is dropped whole.
 */
import { z } from 'zod';

import { templatesForDay, type QuestDay, type QuestTemplateMap } from './templates';

export const QUEST_TITLE_MAX = 24;
export const QUEST_DESC_MAX = 110;
/** Quests published per trip day. */
export const MIN_DAILY_QUESTS = 3;
export const MAX_DAILY_QUESTS = 4;

export const questCandidateSchema = z.object({
  template_id: z.string().min(1).max(40),
  params: z.record(z.string(), z.unknown()),
  title: z.string(),
  desc: z.string(),
  reward: z.object({ xp: z.number().int() }),
});
export type QuestCandidate = z.infer<typeof questCandidateSchema>;

export const questRewardSchema = z.object({
  xp: z.number().int().min(0),
  sticker: z.enum(['settled']).nullable(),
  form_id: z.uuid().nullable(),
});
export type QuestReward = z.infer<typeof questRewardSchema>;

/** A quest ready to publish: every number in it came from code. */
export interface ValidQuest {
  readonly template: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly metric: string;
  readonly target: number;
  readonly reward: QuestReward;
  readonly title: string;
  readonly desc: string;
  /** Local `HH:MM` deadline on the quest day, when the template has one. */
  readonly deadline: string | null;
}

export type QuestVerdict =
  | { readonly ok: true; readonly quest: ValidQuest }
  | { readonly ok: false; readonly reason: string };

const NUMBER = /\d+(?:[.,:]\d+)*/gu;

function numbersIn(text: string): string[] {
  return [...text.matchAll(NUMBER)].map((match) => match[0]);
}

/** The numbers a quest's copy may carry: each fact whole and by part ("06:10" allows "6", "10"). */
export function allowedQuestNumbers(
  facts: Readonly<Record<string, string | number>>,
): ReadonlySet<string> {
  const allowed = new Set<string>();
  for (const token of Object.values(facts).map(String).flatMap(numbersIn)) {
    allowed.add(token);
    for (const part of token.split(/[.,:]/u)) {
      allowed.add(part);
      allowed.add(String(Number(part)));
    }
  }
  return allowed;
}

function ungrounded(text: string, allowed: ReadonlySet<string>): string[] {
  return numbersIn(text).filter((t) => !allowed.has(t) && !allowed.has(String(Number(t))));
}

const tidy = (text: string): string => text.trim().replace(/\s+/gu, ' ');

export function validateQuest(
  candidate: QuestCandidate,
  day: QuestDay,
  templates: QuestTemplateMap,
): QuestVerdict {
  const def = templates.get(candidate.template_id);
  if (def === undefined) return { ok: false, reason: `unknown_template:${candidate.template_id}` };
  if (!templatesForDay(templates, day).includes(def.id)) {
    return { ok: false, reason: `not_today:${def.id}` };
  }
  const parsed = def.params.safeParse(candidate.params);
  if (!parsed.success) return { ok: false, reason: `bad_params:${def.id}` };
  const params = parsed.data;
  const unresolved = def.resolve(params, day);
  if (unresolved !== null) return { ok: false, reason: `${unresolved}:${def.id}` };
  const { xp } = candidate.reward;
  if (xp < def.xp.min || xp > def.xp.max) return { ok: false, reason: `xp_out_of_table:${def.id}` };
  const title = tidy(candidate.title);
  const desc = tidy(candidate.desc);
  if (title.length === 0 || title.length > QUEST_TITLE_MAX) return { ok: false, reason: 'title' };
  if (desc.length === 0 || desc.length > QUEST_DESC_MAX) return { ok: false, reason: 'desc' };
  // Every quest may also name the crew's size ("all 4 of us") and any time on today's plan.
  const allowed = allowedQuestNumbers({
    ...def.facts(params, day),
    travellers: day.travellers,
    plan_times: day.items.map((item) => item.start ?? '').join(', '),
  });
  const loose = [...ungrounded(title, allowed), ...ungrounded(desc, allowed)];
  if (loose.length > 0) return { ok: false, reason: `ungrounded:${loose.join(',')}` };
  const target = def.target(params, day);
  if (!Number.isInteger(target) || target < 1) return { ok: false, reason: 'target' };
  const extras = def.extras(params, day);
  return {
    ok: true,
    quest: {
      template: def.id,
      params,
      metric: def.metric,
      target,
      reward: { xp, sticker: extras.sticker, form_id: extras.form_id },
      title,
      desc,
      deadline: def.deadline(params),
    },
  };
}

/** Same template with the same params twice in a day is one quest. */
export function questKey(quest: Pick<ValidQuest, 'template' | 'params'>): string {
  const sorted = Object.keys(quest.params)
    .sort()
    .map((key) => [key, quest.params[key]]);
  return `${quest.template}:${JSON.stringify(sorted)}`;
}

export interface ValidatedDay {
  readonly quests: readonly ValidQuest[];
  readonly rejected: readonly string[];
}

/** Validates the guide's list: invalid and repeated items are dropped, at most four kept. */
export function validateQuestList(
  candidates: readonly QuestCandidate[],
  day: QuestDay,
  templates: QuestTemplateMap,
): ValidatedDay {
  const quests: ValidQuest[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const verdict = validateQuest(candidate, day, templates);
    if (!verdict.ok) {
      rejected.push(verdict.reason);
      continue;
    }
    const key = questKey(verdict.quest);
    if (seen.has(key)) {
      rejected.push(`repeated:${verdict.quest.template}`);
      continue;
    }
    if (quests.length >= MAX_DAILY_QUESTS) {
      rejected.push('too_many');
      continue;
    }
    seen.add(key);
    quests.push(verdict.quest);
  }
  return { quests, rejected };
}
