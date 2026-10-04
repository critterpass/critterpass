import { describe, expect, it } from 'vitest';

import { PIPELINE } from '../evals/lib/provider';
import { runSuite } from '../evals/lib/runner';
import { caseVarsSchema, loadSuite } from '../evals/lib/suite';
import { SUITES, suitesForChanges } from '../evals/suites';

// The draft suite runs the whole drafting pipeline for every golden crew: allow for a slow runner.
describe('eval suites in replay', { timeout: 180_000 }, () => {
  it.each(SUITES)('%s meets its replay threshold', async (suite) => {
    const report = await runSuite(suite, { mode: 'replay' });
    const failures = report.cases.filter((c) => c.outcome === 'fail');
    expect(failures).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.graded).toBeGreaterThan(0);
  });

  it('skips llm-rubric assertions without a model instead of passing them', async () => {
    const report = await runSuite('persona', { mode: 'replay' });
    const rubrics = report.cases
      .flatMap((c) => c.assertions)
      .filter((a) => a.type === 'llm-rubric');
    expect(rubrics.length).toBeGreaterThan(0);
    expect(rubrics.every((a) => a.outcome === 'skipped')).toBe(true);
  });
});

describe('the eval gate', { timeout: 60_000 }, () => {
  it('fails when the grounding validator regresses', async () => {
    const report = await runSuite('grounding', {
      mode: 'replay',
      pipeline: { ...PIPELINE, validateStructured: () => [], unverifiedTextNumbers: () => [] },
    });
    expect(report.score).toBeLessThan(report.threshold);
    expect(report.ok).toBe(false);
  });

  it('fails when a reply claims a change that still needs a yes', async () => {
    const regression = loadSuite('autonomy').cases[1];
    if (regression === undefined) throw new Error('autonomy suite lost its needs-yes case');
    const report = await runSuite('autonomy', {
      mode: 'replay',
      extraCases: [
        {
          ...regression,
          description: 'seeded regression: claims the dinner already moved',
          vars: caseVarsSchema.parse({
            ...regression.vars,
            replay: { text: "Done! I've moved dinner to 21:00 for everyone." },
          }),
        },
      ],
    });
    expect(report.cases.at(-1)?.outcome).toBe('fail');
    expect(report.ok).toBe(false);
  });

  it('fails when the decider would let a money change run on its own', async () => {
    const report = await runSuite('autonomy', {
      mode: 'replay',
      pipeline: { ...PIPELINE, decideAutonomy: () => ({ outcome: 'auto' }) },
    });
    expect(report.ok).toBe(false);
  });
});

describe('suite selection for a pull request', () => {
  it('maps changed files to the suites they can move', () => {
    expect(suitesForChanges(['packages/ai/evals/grounding/cases.yaml'])).toEqual(['grounding']);
    expect(suitesForChanges(['packages/ai/src/tools/grounding.ts'])).toEqual([
      'chat',
      'grounding',
      'injection',
      'guide',
    ]);
    expect(suitesForChanges(['packages/ai/src/routes/guide/chat.prompt.ts'])).toEqual(['guide']);
    expect(suitesForChanges(['packages/ai/personas/pon.json'])).toEqual([
      'chat',
      'persona',
      'autonomy',
    ]);
    expect(suitesForChanges(['packages/ai/src/routing.ts'])).toEqual([...SUITES]);
    expect(suitesForChanges(['packages/domain/src/guide-actions/decider.ts'])).toEqual([
      'autonomy',
    ]);
    expect(suitesForChanges(['apps/mobile/app/index.tsx'])).toEqual([]);
  });
});
