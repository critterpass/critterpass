import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderLabFlow, renderSeedFlow, staleFlows, stepShots } from './sweep-flows';
import { LABS, manifestProblems, SEEDS, SWEEP_DIR, sweepFlows } from './sweep-manifest';

const ROOT = path.resolve(import.meta.dirname, '../../..');

describe('UI sweep flows', () => {
  it('are the ones the manifest generates (run sweep-flows.ts --write after a change)', () => {
    expect(staleFlows(ROOT)).toEqual([]);
  });

  it('come from a manifest with no name used twice', () => {
    expect(manifestProblems()).toEqual([]);
  });

  it('list for every seed exactly the screenshots its steps take', () => {
    for (const seed of SEEDS) {
      const steps = `${SWEEP_DIR}/subflows/seed-${seed.name}.yaml`;
      expect(existsSync(path.join(ROOT, steps)), steps).toBe(true);
      expect({ seed: seed.name, shots: stepShots(ROOT, steps).sort() }).toEqual({
        seed: seed.name,
        shots: [...seed.shots].sort(),
      });
    }
  });

  it('open a lab from a fresh launch and give every scene its own subflow call', () => {
    const lab = LABS.find((candidate) => candidate.name === 'search');
    if (!lab) throw new Error('the search lab left the manifest');
    const text = renderLabFlow(lab, 'vi');
    expect(text).toContain("  LANG: vi\n  NAV: dev-nav-search-lab\n  LIST: 'search-lab-.*'\n---");
    expect(text.match(/- runFlow: subflows\/open-lab\.yaml/g)).toHaveLength(1);
    expect(text.match(/file: subflows\/lab-scene\.yaml/g)).toHaveLength(lab.scenes.length);
    expect(text).toContain(
      '      ITEM: search-lab-7d-1\n      READY: search-clipboard-card\n      SHOT: vi-7d-1-search\n',
    );
    // Never a walk back to Developer tools between labs.
    expect(text).not.toMatch(/back-to-dev-tools|dev-tools-again/);
  });

  it('start a seeded account through "start as" and a new one through onboarding', () => {
    const seed = (name: string) => {
      const found = SEEDS.find((candidate) => candidate.name === name);
      if (!found) throw new Error(`the ${name} seed left the manifest`);
      return found;
    };
    expect(renderSeedFlow(seed('caught-up'), 'vi')).toContain(
      '    file: ../_shared/start-as.yaml\n    env:\n      SCENARIO: caught_up\n      LANG: vi\n',
    );
    const firstRun = renderSeedFlow(seed('first-run'), 'en');
    expect(firstRun).toContain('- runFlow: ../home/subflows/onboard.yaml\n');
    expect(firstRun).not.toContain('start-as');
  });

  it('name each flow and its screenshots by language', () => {
    const flow = sweepFlows().find((candidate) => candidate.flow === 'e2e/sweep/seed-inbox-vi');
    expect(flow?.shots).toContain('vi-3b-2-one-card');
    expect(sweepFlows().every((candidate) => candidate.shots.length > 0)).toBe(true);
  });
});
