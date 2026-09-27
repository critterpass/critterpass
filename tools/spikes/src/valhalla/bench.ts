import { summarize, type LatencySummary } from '../s-db/stats';

import type { ValhallaClient } from './client';
import { formatError } from '../shared/format-error';
import { type CityBbox, samplePointInBbox, samplePointsInBbox } from './cities';

const MAX_ATTEMPTS_PER_SAMPLE = 3;

/**
 * Times `count` sequential calls to `fn`, where `fn` builds a fresh random request from `rng`
 * each attempt. A request Valhalla can't answer (e.g. a sampled point lands off the road/path
 * network) is resampled up to `MAX_ATTEMPTS_PER_SAMPLE` times before being counted as a failure;
 * failed attempts are excluded from the latency samples so one bad coordinate doesn't skew p95.
 */
async function timeWithResample(
  count: number,
  fn: () => Promise<void>,
): Promise<{ latenciesMs: number[]; failures: number; lastError: string | undefined }> {
  const latenciesMs: number[] = [];
  let failures = 0;
  let lastError: string | undefined;
  for (let i = 0; i < count; i += 1) {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const startedAt = performance.now();
      try {
        // Intentionally sequential: measures round-trip latency one call at a time.
        await fn();
        latenciesMs.push(performance.now() - startedAt);
        break;
      } catch (error) {
        lastError = formatError(error);
        if (attempt >= MAX_ATTEMPTS_PER_SAMPLE) {
          failures += 1;
          break;
        }
      }
    }
  }
  return { latenciesMs, failures, lastError };
}

export interface CityBenchResult {
  readonly city: string;
  readonly label: string;
  readonly country: string;
  readonly walk: LatencySummary;
  readonly drive: LatencySummary;
  readonly matrixWalk: LatencySummary;
  readonly matrixDrive: LatencySummary;
  readonly failures: {
    readonly walk: number;
    readonly drive: number;
    readonly matrixWalk: number;
    readonly matrixDrive: number;
  };
}

export interface BenchReport {
  readonly cityResults: CityBenchResult[];
  readonly overallWalk: LatencySummary;
  readonly overallDrive: LatencySummary;
  readonly overallMatrixWalk: LatencySummary;
  readonly overallMatrixDrive: LatencySummary;
}

export interface BenchOptions {
  readonly client: ValhallaClient;
  readonly cities: readonly CityBbox[];
  readonly pairsPerCityPerMode: number;
  readonly matrixCallsPerCityPerMode: number;
  readonly matrixSize: number;
  readonly seed: number;
  readonly onProgress?: (step: string) => void;
}

/** Runs the walk/drive route + 16x16 matrix bench across every city in `options.cities`. */
export async function runBench(options: BenchOptions, rng: () => number): Promise<BenchReport> {
  const { client } = options;
  const cityResults: CityBenchResult[] = [];
  const allWalk: number[] = [];
  const allDrive: number[] = [];
  const allMatrixWalk: number[] = [];
  const allMatrixDrive: number[] = [];

  for (const city of options.cities) {
    options.onProgress?.(`${city.key}: routes`);
    const walk = await timeWithResample(options.pairsPerCityPerMode, async () => {
      const [a, b] = [samplePointInBbox(city, rng), samplePointInBbox(city, rng)];
      await client.route([a, b], 'pedestrian');
    });
    const drive = await timeWithResample(options.pairsPerCityPerMode, async () => {
      const [a, b] = [samplePointInBbox(city, rng), samplePointInBbox(city, rng)];
      await client.route([a, b], 'auto');
    });

    options.onProgress?.(`${city.key}: matrices`);
    const matrixWalk = await timeWithResample(options.matrixCallsPerCityPerMode, async () => {
      const sources = samplePointsInBbox(city, rng, options.matrixSize);
      const targets = samplePointsInBbox(city, rng, options.matrixSize);
      await client.matrix(sources, targets, 'pedestrian');
    });
    const matrixDrive = await timeWithResample(options.matrixCallsPerCityPerMode, async () => {
      const sources = samplePointsInBbox(city, rng, options.matrixSize);
      const targets = samplePointsInBbox(city, rng, options.matrixSize);
      await client.matrix(sources, targets, 'auto');
    });

    allWalk.push(...walk.latenciesMs);
    allDrive.push(...drive.latenciesMs);
    allMatrixWalk.push(...matrixWalk.latenciesMs);
    allMatrixDrive.push(...matrixDrive.latenciesMs);

    cityResults.push({
      city: city.key,
      label: city.label,
      country: city.country,
      walk: summarize(walk.latenciesMs),
      drive: summarize(drive.latenciesMs),
      matrixWalk: summarize(matrixWalk.latenciesMs),
      matrixDrive: summarize(matrixDrive.latenciesMs),
      failures: {
        walk: walk.failures,
        drive: drive.failures,
        matrixWalk: matrixWalk.failures,
        matrixDrive: matrixDrive.failures,
      },
    });
    options.onProgress?.(`${city.key}: done`);
  }

  return {
    cityResults,
    overallWalk: summarize(allWalk),
    overallDrive: summarize(allDrive),
    overallMatrixWalk: summarize(allMatrixWalk),
    overallMatrixDrive: summarize(allMatrixDrive),
  };
}
