/**
 * Records the golden crews' drafts planned from typed place facts (`planner.typed_places` on, the
 * labels in golden/typed-places.json) into fixtures-typed/, so the typed replay
 * (./typed-replay.ts) serves key-on inputs the guide's replies to key-on inputs.
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/ai exec tsx evals/draft/typed-record.ts [--off <dir>]
 *
 * `--off <dir>` records the key-off drafts into `<dir>` instead: two recordings of the same input
 * show how far the replay moves from the model alone. EVAL_CASES narrows the crews.
 */
import { runDraftPlan } from '../../src/prompts/draft/pipeline';
import { CREWS, planInput } from './cases';
import { pooled } from './pool';
import { caseModel, TYPED_FIXTURES } from './recorded-model';

async function main(): Promise<void> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  const baseURL = process.env['ANTHROPIC_BASE_URL'];
  if (apiKey === undefined) throw new Error('ANTHROPIC_API_KEY is required');
  const offAt = process.argv.indexOf('--off');
  const offDir = offAt === -1 ? undefined : process.argv[offAt + 1];
  const typed = offDir === undefined;
  const only = process.env['EVAL_CASES']?.split(',').filter(Boolean) ?? [];
  const crews = only.length === 0 ? CREWS : CREWS.filter((c) => only.includes(c.id));
  const options = { mode: 'live', apiKey, record: true, ...(baseURL ? { baseURL } : {}) } as const;
  const results = await pooled(crews, 4, async (crew) => {
    const { model, save } = caseModel(crew.id, options, offDir ?? TYPED_FIXTURES);
    try {
      const result = await runDraftPlan(model, planInput(crew, undefined, typed));
      return `${crew.id}: ${result.final.ok ? 'clean' : 'violations'}`;
    } catch (error) {
      return `${crew.id}: failed ${String(error).slice(0, 160)}`;
    } finally {
      save();
    }
  });
  console.log(results.join('\n'));
}

await main();
