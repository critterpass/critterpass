/**
 * Runs every profile pipeline over the sample and writes `profiles.json` (and `sample.json`).
 * `railway run --service worker --environment staging -- pnpm --filter @cp/spikes exec tsx
 * place-content/run-profiles.ts [placeFilter] [pipelineFilter]` with SPIKE_OUT set.
 */
import { loadSample, withReadOnly } from './db';
import { ledger, writeOut } from './lib';
import { PIPELINES, runProfile, type ProfileResult } from './profile';

const [placeFilter = '', pipelineFilter = ''] = process.argv.slice(2);

const sample = (await withReadOnly(loadSample)).filter((p) =>
  p.name.toLowerCase().includes(placeFilter.toLowerCase()),
);
writeOut('sample.json', sample);

const pipelines = PIPELINES.filter((p) => p.id.includes(pipelineFilter));
const results: ProfileResult[] = [];
const queue = sample.flatMap((place) => pipelines.map((spec) => ({ place, spec })));
const CONCURRENCY = 6;

async function worker(): Promise<void> {
  for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
    try {
      const result = await runProfile(job.place, job.spec);
      results.push(result);
      console.log(
        `${job.spec.id.padEnd(14)} ${job.place.name.slice(0, 32).padEnd(32)} kept ${result.kept.length} dropped ${result.dropped.length} ${result.ms} ms`,
      );
    } catch (error) {
      console.log(`${job.spec.id} ${job.place.name} failed: ${(error as Error).message}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
writeOut(`profiles${placeFilter === '' && pipelineFilter === '' ? '' : '-partial'}.json`, results);
console.log(
  `spend this run: $${(ledger.micros / 1e6).toFixed(4)}, ${ledger.searches} searches, ${ledger.extractCredits} extract credits, ${ledger.calls} calls`,
);
