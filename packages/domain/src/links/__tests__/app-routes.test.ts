import { describe, expect, it } from 'vitest';

import { appRoutePattern, matchAppRoute, type AppRoutePattern } from '../app-routes';

const FILES = [
  '_layout.tsx',
  '+not-found.tsx',
  'index.tsx',
  '(tabs)/_layout.tsx',
  '(tabs)/pass.tsx',
  '(tabs)/wallet/bookings/index.tsx',
  '(tabs)/wallet/bookings/[id].tsx',
  '(tabs)/wallet/bookings/add.tsx',
  '(trip)/[tripId]/plan/index.tsx',
  '(trip)/trip/[tripId]/[...rest].tsx',
  '(trip)/trip/[tripId]/draft.tsx',
  'crew/__tests__/crew.test.tsx',
];
const patterns = FILES.map(appRoutePattern).filter(
  (pattern): pattern is AppRoutePattern => pattern !== null,
);
const fileOf = (path: string) => matchAppRoute(patterns, path)?.file ?? null;

describe('route files read as path patterns', () => {
  it('drops groups, reads index as its folder and skips files that are no screen', () => {
    expect(patterns.map((pattern) => pattern.segments.join('/'))).toEqual([
      '',
      'pass',
      'wallet/bookings',
      'wallet/bookings/*',
      'wallet/bookings/add',
      '*/plan',
      'trip/*/**',
      'trip/*/draft',
    ]);
  });

  it('matches a path to its screen, query and trailing slash aside', () => {
    expect(fileOf('/')).toBe('index.tsx');
    expect(fileOf('/pass')).toBe('(tabs)/pass.tsx');
    expect(fileOf('/wallet/bookings/')).toBe('(tabs)/wallet/bookings/index.tsx');
    expect(fileOf('/wallet/bookings/b1?from=push')).toBe('(tabs)/wallet/bookings/[id].tsx');
    expect(fileOf('/t1/plan')).toBe('(trip)/[tripId]/plan/index.tsx');
  });

  it('prefers a static segment to a parameter, and a parameter to the rest of the path', () => {
    expect(fileOf('/wallet/bookings/add')).toBe('(tabs)/wallet/bookings/add.tsx');
    expect(fileOf('/trip/t1/draft')).toBe('(trip)/trip/[tripId]/draft.tsx');
    expect(fileOf('/trip/t1/review/c1')).toBe('(trip)/trip/[tripId]/[...rest].tsx');
  });

  it('has no screen for a path no file names', () => {
    expect(fileOf('/wallet/money/settle')).toBeNull();
    expect(fileOf('/wallet/bookings/b1/extra')).toBeNull();
    expect(fileOf('/trip/t1')).toBeNull();
    expect(fileOf('/polls/p1')).toBeNull();
  });
});
