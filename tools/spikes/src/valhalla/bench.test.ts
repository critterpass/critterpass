import { describe, expect, it } from 'vitest';

import { runBench } from './bench';
import type { MatrixCell, ValhallaClient } from './client';
import { createRng, type CityBbox } from './cities';

const testCity: CityBbox = {
  key: 'test-city',
  label: 'Test City',
  country: 'Testland',
  group: 'sea-japan',
  south: 0,
  west: 0,
  north: 1,
  east: 1,
};

const otherCity: CityBbox = { ...testCity, key: 'other-city', label: 'Other City' };

function fixedMatrix(size: number): MatrixCell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ time: 1, distance: 1 })),
  );
}

/** Always-succeeds fake client: a network-boundary test double, per repo test conventions. */
function createAlwaysOkClient(): ValhallaClient {
  return {
    route() {
      return Promise.resolve({ durationSeconds: 60, lengthKm: 0.5 });
    },
    matrix(sources) {
      return Promise.resolve(fixedMatrix(sources.length));
    },
    status() {
      return Promise.resolve(true);
    },
  };
}

describe('runBench', () => {
  it('aggregates per-city results into overall summaries with the expected sample counts', async () => {
    const client = createAlwaysOkClient();
    const report = await runBench(
      {
        client,
        cities: [testCity, otherCity],
        pairsPerCityPerMode: 4,
        matrixCallsPerCityPerMode: 2,
        matrixSize: 4,
        seed: 1,
      },
      createRng(1),
    );

    expect(report.cityResults).toHaveLength(2);
    expect(report.cityResults[0]?.walk.count).toBe(4);
    expect(report.cityResults[0]?.drive.count).toBe(4);
    expect(report.cityResults[0]?.matrixWalk.count).toBe(2);
    expect(report.overallWalk.count).toBe(8);
    expect(report.overallDrive.count).toBe(8);
    expect(report.overallMatrixWalk.count).toBe(4);
    for (const city of report.cityResults) {
      expect(city.failures).toEqual({ walk: 0, drive: 0, matrixWalk: 0, matrixDrive: 0 });
    }
  });

  it('excludes persistently failing samples from latency stats and counts them as failures', async () => {
    const flakyClient: ValhallaClient = {
      route() {
        return Promise.reject(new Error('no route found (simulated unreachable point)'));
      },
      matrix(sources) {
        return Promise.resolve(fixedMatrix(sources.length));
      },
      status() {
        return Promise.resolve(true);
      },
    };

    const report = await runBench(
      {
        client: flakyClient,
        cities: [testCity],
        pairsPerCityPerMode: 3,
        matrixCallsPerCityPerMode: 1,
        matrixSize: 2,
        seed: 2,
      },
      createRng(2),
    );

    const city = report.cityResults[0];
    expect(city?.walk.count).toBe(0);
    expect(city?.failures.walk).toBe(3);
    expect(city?.failures.drive).toBe(3);
    // Matrices still succeed for this fake, so they must not be affected by route failures.
    expect(city?.matrixWalk.count).toBe(1);
    expect(city?.failures.matrixWalk).toBe(0);
  });

  it('is deterministic for a fixed seed', async () => {
    const client = createAlwaysOkClient();
    const options = {
      client,
      cities: [testCity],
      pairsPerCityPerMode: 5,
      matrixCallsPerCityPerMode: 1,
      matrixSize: 3,
      seed: 99,
    };
    const first = await runBench(options, createRng(99));
    const second = await runBench(options, createRng(99));
    expect(first.cityResults[0]?.walk.count).toBe(second.cityResults[0]?.walk.count);
  });

  it('calls onProgress with a step per city', async () => {
    const steps: string[] = [];
    const client = createAlwaysOkClient();
    await runBench(
      {
        client,
        cities: [testCity],
        pairsPerCityPerMode: 1,
        matrixCallsPerCityPerMode: 1,
        matrixSize: 2,
        seed: 3,
        onProgress: (step) => steps.push(step),
      },
      createRng(3),
    );
    expect(steps).toEqual(['test-city: routes', 'test-city: matrices', 'test-city: done']);
  });
});
