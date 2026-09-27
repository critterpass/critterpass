/**
 * The eval suites and which changes affect which: a pull request runs only the suites its changed
 * files can move (the nightly run and pushes to main run them all).
 */
export const SUITES = ['chat', 'persona', 'grounding', 'injection', 'autonomy'] as const;
export type SuiteName = (typeof SUITES)[number];

const ALL: readonly SuiteName[] = SUITES;

/** Repo-relative path pattern → suites a change there can move. First match wins. */
const RULES: readonly (readonly [RegExp, readonly SuiteName[]])[] = [
  [/^packages\/ai\/evals\/(chat|persona|grounding|injection|autonomy)\//u, []],
  [/^packages\/ai\/evals\//u, ALL],
  [/^packages\/ai\/(personas\/|src\/(persona|prompts)\/)/u, ['chat', 'persona', 'autonomy']],
  [/^packages\/ai\/src\/tools\//u, ['chat', 'grounding', 'injection']],
  [/^packages\/ai\/src\/context\//u, ['injection', 'persona']],
  [/^packages\/ai\/src\/(routing|client|errors|pricing|batch)\.ts$/u, ALL],
  [/^packages\/ai\/src\/runner\//u, ['chat', 'injection']],
  [/^packages\/domain\/src\/(guide-actions|plan)\//u, ['autonomy']],
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
