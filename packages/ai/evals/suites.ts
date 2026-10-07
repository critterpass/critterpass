/**
 * The eval suites and which changes affect which: a pull request runs only the suites its changed
 * files can move (the nightly run and pushes to main run them all).
 */
export const SUITES = [
  'chat',
  'persona',
  'grounding',
  'injection',
  'autonomy',
  'compliance',
  'invite-tags',
  'crew-welcome',
  'tips',
  'pitch',
  'guest-brief',
  'availability-ask',
  'ask-reply',
  'fit-note',
  'draft',
  'receipt-parse',
  'booking-extract',
  'vendor-reply',
  'guide',
  'briefing',
  'disruption',
  'watch',
  'replan',
  'late',
  'place-qna',
  'proposal',
  'quests',
  'recap',
  'album',
  'translate',
  'help',
  'sos',
  'hours-research',
  'search-parse',
  'link-extract',
  'place-compromise',
  'facts-research',
  'fit-check',
  'provider-extract',
  'menu',
] as const;
export type SuiteName = (typeof SUITES)[number];

const ALL: readonly SuiteName[] = SUITES;

/** Repo-relative path pattern → suites a change there can move. First match wins. */
const RULES: readonly (readonly [RegExp, readonly SuiteName[]])[] = [
  [/^packages\/ai\/evals\/(chat|persona|grounding|injection|autonomy|compliance)\//u, []],
  [/^packages\/ai\/src\/prompts\/invite-tags\//u, ['invite-tags']],
  [/^packages\/ai\/src\/prompts\/crew-welcome\//u, ['crew-welcome']],
  [/^packages\/ai\/src\/prompts\/tips\//u, ['tips']],
  [/^packages\/ai\/src\/prompts\/pitch\//u, ['pitch']],
  [/^packages\/ai\/src\/prompts\/guest-brief\//u, ['guest-brief']],
  [/^packages\/ai\/src\/prompts\/availability-ask\//u, ['availability-ask', 'ask-reply']],
  [/^packages\/ai\/src\/prompts\/ask-reply\//u, ['ask-reply']],
  [/^packages\/ai\/src\/prompts\/fit-note\//u, ['fit-note']],
  [/^packages\/ai\/(src\/routes|evals)\/receipt-parse\//u, ['receipt-parse']],
  [/^packages\/ai\/(src\/routes|evals)\/booking-extract\//u, ['booking-extract']],
  [/^packages\/ai\/(src\/routes|evals)\/vendor-reply\//u, ['vendor-reply']],
  [/^packages\/ai\/evals\/lib\/setup-suites\.ts$/u, ['availability-ask', 'ask-reply', 'fit-note']],
  [/^packages\/ai\/(src\/prompts|evals)\/draft\//u, ['draft']],
  [/^packages\/ai\/(src\/routes|evals)\/guide\//u, ['guide']],
  [/^packages\/ai\/(src\/routes|evals)\/briefing\//u, ['briefing']],
  [/^packages\/ai\/(src\/routes|evals)\/disruption\//u, ['disruption', 'watch', 'replan', 'late']],
  [/^packages\/ai\/(src\/routes|evals)\/watch\//u, ['watch']],
  [/^packages\/ai\/(src\/routes|evals)\/replan\//u, ['replan']],
  [/^packages\/ai\/(src\/routes|evals)\/late\//u, ['late']],
  [/^packages\/ai\/(src\/routes|evals)\/explore\//u, ['place-qna']],
  [/^packages\/ai\/(src\/routes|evals)\/proposal\//u, ['proposal', 'place-compromise']],
  [/^packages\/ai\/(src\/routes|evals)\/quests\//u, ['quests']],
  [
    /^packages\/ai\/(src\/routes|evals)\/recap\//u,
    ['recap', 'album', 'place-compromise', 'facts-research'],
  ],
  [/^packages\/ai\/(src\/routes|evals)\/album\//u, ['album']],
  [/^packages\/ai\/(src\/routes|evals)\/translate\//u, ['translate']],
  [/^packages\/ai\/(src\/routes|evals)\/help\//u, ['help', 'sos']],
  [/^packages\/ai\/(src\/routes|evals)\/sos\//u, ['sos']],
  [/^packages\/ai\/(src\/routes|evals)\/hours-research\//u, ['hours-research', 'facts-research']],
  [/^packages\/domain\/src\/places\/hours/u, ['hours-research']],
  [
    /^packages\/ai\/(src\/routes|evals)\/search-parse\//u,
    ['search-parse', 'link-extract', 'place-compromise', 'facts-research'],
  ],
  [/^packages\/ai\/(src\/routes|evals)\/link-extract\//u, ['link-extract', 'facts-research']],
  [/^packages\/ai\/(src\/routes|evals)\/place-compromise\//u, ['place-compromise']],
  [/^packages\/ai\/(src\/routes|evals)\/facts-research\//u, ['facts-research']],
  [/^packages\/ai\/evals\/fit-check\//u, ['fit-check']],
  [/^packages\/ai\/(src\/routes|evals)\/provider-extract\//u, ['provider-extract']],
  [/^packages\/domain\/src\/drivers\//u, ['provider-extract']],
  [/^packages\/ai\/(src\/routes\/camera|evals\/menu)\//u, ['menu']],
  [/^packages\/domain\/src\/safety\//u, ['help', 'sos']],
  [/^packages\/planner\/src\/draft\//u, ['draft']],
  [/^packages\/ai\/evals\/lib\/guest-brief-suite\.ts$/u, ['guest-brief']],
  [/^packages\/ai\/evals\/lib\/stream-suites\.ts$/u, ['pitch', 'guest-brief']],
  [
    /^packages\/ai\/evals\/lib\/prompt-suites\.ts$/u,
    ['invite-tags', 'crew-welcome', 'tips', 'pitch', 'availability-ask', 'ask-reply', 'fit-note'],
  ],
  [/^packages\/ai\/evals\//u, ALL],
  [/^packages\/ai\/(personas\/|src\/(persona|prompts)\/)/u, ['chat', 'persona', 'autonomy']],
  [
    /^packages\/ai\/src\/tools\/read-tools\.ts$/u,
    ['chat', 'grounding', 'injection', 'guide', 'fit-check'],
  ],
  [/^packages\/ai\/src\/tools\//u, ['chat', 'grounding', 'injection', 'guide']],
  [/^packages\/ai\/src\/context\//u, ['injection', 'persona']],
  [/^packages\/ai\/src\/decide\//u, ['compliance']],
  [/^packages\/ai\/src\/(routing|client|errors|pricing|batch)\.ts$/u, ALL],
  [/^packages\/ai\/src\/runner\//u, ['chat', 'injection', 'guide']],
  [/^packages\/domain\/src\/(guide-actions|plan)\//u, ['autonomy']],
  [/^packages\/domain\/src\/pitches\//u, ['pitch']],
  [/^packages\/domain\/src\/trip-day\//u, ['briefing']],
  [/^packages\/domain\/src\/proposal\//u, ['proposal']],
  [/^packages\/domain\/src\/quests\//u, ['quests']],
  [/^packages\/domain\/src\/recap\//u, ['recap']],
  [/^packages\/domain\/src\/album\//u, ['album']],
  [/^packages\/domain\/src\/locale\//u, ['translate']],
  [/^packages\/domain\/src\/ai\//u, ALL],
];

export function isSuiteName(value: string): value is SuiteName {
  return (SUITES as readonly string[]).includes(value);
}

export function suitesForChanges(paths: readonly string[]): SuiteName[] {
  const picked = new Set<SuiteName>();
  for (const path of paths) {
    const rule = RULES.find(([pattern]) => pattern.test(path));
    if (rule === undefined) continue;
    const own = /^packages\/ai\/evals\/([a-z]+)\//u.exec(path)?.[1];
    for (const suite of rule[1].length === 0 && own !== undefined && isSuiteName(own)
      ? [own]
      : rule[1]) {
      picked.add(suite);
    }
  }
  return SUITES.filter((suite) => picked.has(suite));
}
