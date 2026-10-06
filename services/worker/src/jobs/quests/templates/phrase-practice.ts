/**
 * The phrase practice quest ("say it in the local language"): the crew practises `n` different
 * phrases in one language during the quest day. It reads `phrase.practised`, which the api emits
 * for a practice that went well inside a trip; the same phrase practised twice counts once.
 */
import { z } from 'zod';

import {
  registerQuestTemplate,
  type QuestMatcher,
  type QuestTemplateRegistration,
} from './registry';

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const base = (language: string): string => language.toLowerCase().split('-')[0] ?? '';

const paramsSchema = z
  .object({
    n: z.number().int().min(1).max(10),
    /** BCP 47 language the phrases are in (`id`, `vi`, `ja`). */
    language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/u),
  })
  .strict();
type PhrasePracticeParams = z.infer<typeof paramsSchema>;

export const matchPhrasePractice: QuestMatcher = (input) => {
  const { payload } = input.event;
  const user = str(payload['user_id']);
  const phrase = str(payload['phrase_id']);
  const language = str(payload['language']);
  const wanted = str(input.quest.params['language']);
  const at = input.event.occurred_at.getTime();
  const counts =
    user !== null &&
    phrase !== null &&
    language !== null &&
    wanted !== null &&
    payload['trip_id'] === input.quest.trip_id &&
    input.audience.has(user) &&
    base(language) === base(wanted) &&
    at >= input.quest.day_start.getTime() &&
    at <= input.quest.ends_at.getTime();
  return Promise.resolve(counts ? { key: phrase } : null);
};

export const phrasePracticeTemplate: QuestTemplateRegistration<PhrasePracticeParams> = {
  id: 'phrase_practice',
  summary:
    'The crew practises n different phrases with the guide in one language (language is the BCP 47 tag of the local language, n is at most 10; five is a good day).',
  params: paramsSchema,
  consumes: ['phrase.practised'],
  metric: 'phrases',
  xp: { min: 40, max: 100 },
  needsVisits: false,
  minTravellers: 1,
  target: (params) => params.n,
  resolve: () => null,
  facts: (params) => ({ phrases: params.n, language: params.language }),
  deadline: () => null,
  extras: () => ({ sticker: null, form_id: null }),
  match: matchPhrasePractice,
};

let registered = false;

/** Registers the template once per process, next to the built-in ones. */
export function registerPhrasePracticeTemplate(): void {
  if (registered) return;
  registered = true;
  registerQuestTemplate(phrasePracticeTemplate);
}
