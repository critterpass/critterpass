import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  appRoutes,
  coverage,
  designIdOf,
  formatCoverage,
  NO_SCREEN_BY_DESIGN,
  registeredPaths,
  registryIds,
  routePath,
} from './sweep-coverage';

const ROOT = path.resolve(import.meta.dirname, '../../..');

describe('UI sweep coverage', () => {
  it('has a screenshot for every design id the app registers, or a reason it has none', () => {
    // A new registered screen needs a scene in sweep-manifest.json (then sweep-flows.ts --write),
    // or a line in NO_SCREEN_BY_DESIGN when no screenshot of it can be taken.
    expect(coverage(ROOT).registeredMissing).toEqual([]);
  });

  it('keeps the list of screens without a screenshot to ids that are registered and unswept', () => {
    const { registeredNoScreen } = coverage(ROOT);
    expect(registeredNoScreen.map((entry) => entry.id).sort()).toEqual(
      Object.keys(NO_SCREEN_BY_DESIGN).sort(),
    );
  });

  it('reads the registry, also through a named route builder', () => {
    // `'3b-4': HOME_ROUTES.inbox`, `'7c-1': placesMap,`, `'7h-3': dayScreen(checkRoutes.lessDriving)`.
    expect(registryIds(ROOT).registered).toEqual(
      expect.arrayContaining(['3b-4', '7c-1', '7h-3', '7g-3']),
    );
  });

  it('lists user-facing routes only', () => {
    expect(appRoutes(ROOT)).toContain('crew/new');
    expect(appRoutes(ROOT).some((route) => route.includes('(dev)'))).toBe(false);
  });

  it('matches a route file to the path a feature names for it', () => {
    expect(routePath('(tabs)/trips/[tripId]/index')).toBe('/trips/[]');
    expect(routePath('inbox/index')).toBe('/inbox');
    expect(registeredPaths(ROOT).has('/inbox')).toBe(true);
    const { routesWithoutDesign } = coverage(ROOT);
    expect(routesWithoutDesign).not.toContain('inbox/index');
    expect(routesWithoutDesign).toContain('recap-link/[token]');
  });

  it('names the design id of a screenshot', () => {
    expect(designIdOf('3c-1-showdown')).toBe('3c-1');
    expect(designIdOf('6e-1')).toBe('6e-1');
    expect(designIdOf('crew-new-code')).toBeUndefined();
  });

  it('formats a report with the counts', () => {
    const report = formatCoverage(coverage(ROOT));
    expect(report).toMatch(/Registered design ids with a screenshot: \*\*\d+ of \d+\*\*/);
    expect(report).toMatch(/Routes with no design \(\d+ of \d+/);
  });
});
