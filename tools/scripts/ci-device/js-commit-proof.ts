/**
 * Proves a shard's flows ran the JS exported for this run, from what the app itself logs: dev and
 * e2e builds write `[qa-build] js:<commit>` when they start (apps/mobile/src/lib/qa/ui-qa), into the
 * same report log the `[ui-qa]` scan reads after every flow (the simulator's data container, or
 * logcat on an emulator). No flow has to open a screen for it.
 */
export const QA_BUILD_TAG = '[qa-build]';

/** The commits named by the log's `[qa-build] js:<commit>` lines, in order. */
export function buildCommits(log: string): string[] {
  const commits: string[] = [];
  for (const match of log.matchAll(/\[qa-build\] js:(\S+)/g)) commits.push(match[1] ?? '');
  return commits;
}

/** Null when every reported build is `expected` and at least one was; else what went wrong. */
export function commitProblem(seen: readonly string[], expected: string): string | null {
  if (seen.length === 0)
    return `the app never logged its JS build (${QA_BUILD_TAG} js:${expected}): did it start?`;
  const other = [...new Set(seen.filter((commit) => commit !== expected))];
  if (other.length > 0)
    return `the app ran JS from ${other.join(', ')}, not this run's export (js:${expected})`;
  return null;
}
