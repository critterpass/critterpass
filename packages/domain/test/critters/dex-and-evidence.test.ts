import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VERIFY_CONFIG,
  dexCounts,
  dexSections,
  distanceBand,
  evidenceSigningPayload,
  homeCollectGate,
  homeSetFor,
  MOCK_FLAG_ACCESSORY,
  MOCK_FLAG_SIMULATED,
  resolveEncounterConfig,
  resolveVerifyConfig,
  scoreEvidence,
  type EvidenceBundle,
  type EvidenceScoreInput,
} from '../../src';

describe('dexCounts', () => {
  const critters = [
    { id: 'c1', set_id: 'vn', no: 1 },
    { id: 'c2', set_id: 'vn', no: 2 },
    { id: 'c3', set_id: 'jp', no: 3 },
  ];
  const forms = [
    { id: 'c1-common', critter_id: 'c1', rarity: 'common' as const },
    { id: 'c1-rare', critter_id: 'c1', rarity: 'rare' as const },
    { id: 'c2-common', critter_id: 'c2', rarity: 'common' as const },
    { id: 'c3-epic', critter_id: 'c3', rarity: 'epic' as const },
  ];

  it('counts distinct critters, forms separately, and only verified entries', () => {
    const counts = dexCounts({
      critters,
      forms,
      entries: [
        { form_id: 'c1-common', critter_id: 'c1', verification: 'verified' },
        { form_id: 'c1-rare', critter_id: 'c1', verification: 'verified' },
        { form_id: 'c2-common', critter_id: 'c2', verification: 'pending' },
        { form_id: 'c3-epic', critter_id: 'c3', verification: 'revoked' },
      ],
    });
    expect(counts.critters).toEqual({ found: 1, total: 3 });
    expect(counts.forms).toBe(2);
    expect(counts.perSet.get('vn')).toEqual({ found: 1, total: 2 });
    expect(counts.perSet.get('jp')).toEqual({ found: 0, total: 1 });
    expect([...(counts.dots.get('c1') ?? [])].sort()).toEqual(['common', 'rare']);
  });

  it('orders here-now, the legendary on your dates, home, then sets by rank', () => {
    const sets = [
      { id: 'jp', rank: 2, country: 'JP' },
      { id: 'vn', rank: 1, country: 'VN' },
      { id: 'sg', rank: null, country: 'SG' },
      { id: 'id', rank: 3, country: 'ID' },
    ];
    expect(dexSections({ sets, hereSetId: 'vn', legendaryOnDates: true, homeSetId: 'sg' })).toEqual(
      [
        { kind: 'here_now', set_id: 'vn' },
        { kind: 'legendary_on_dates', set_id: null },
        { kind: 'home', set_id: 'sg' },
        { kind: 'place', set_id: 'jp' },
        { kind: 'place', set_id: 'id' },
      ],
    );
  });
});

describe('home set', () => {
  it('picks the home country set and gates collecting at home', () => {
    const sets = [
      { id: 'vn', country: 'VN', rank: 1 },
      { id: 'sg', country: 'SG', rank: 4 },
    ];
    expect(homeSetFor('sg', sets)?.id).toBe('sg');
    expect(homeSetFor(null, sets)).toBeUndefined();
    const base = { setCountry: 'SG', homeCountry: 'SG', foreground: true };
    expect(homeCollectGate({ ...base, exploreAtHome: false })).toBe('home_needs_opt_in');
    expect(homeCollectGate({ ...base, exploreAtHome: true })).toBe('allowed');
    expect(homeCollectGate({ ...base, exploreAtHome: true, foreground: false })).toBe(
      'home_needs_foreground',
    );
    expect(homeCollectGate({ ...base, setCountry: 'VN', exploreAtHome: false })).toBe('allowed');
  });
});

describe('config overrides', () => {
  it('applies valid fields and ignores the rest', () => {
    const config = resolveEncounterConfig({ grace_s: 120, drain_ratio: -1, bogus: 1 });
    expect(config.grace_s).toBe(120);
    expect(config.drain_ratio).toBeCloseTo(1 / 3);
    expect(resolveVerifyConfig(null)).toEqual(DEFAULT_VERIFY_CONFIG);
  });
});

const bundle = (over: Partial<EvidenceBundle> = {}): EvidenceBundle => ({
  samples_hash: 'a'.repeat(64),
  dwell: { count: 40, mean_accuracy_m: 12, max_speed_mps: 1.2, duration_s: 320, inside_s: 305 },
  mock_flags: 0,
  device_ts: '2026-10-03T03:00:00Z',
  ...over,
});
const input = (over: Partial<EvidenceScoreInput> = {}): EvidenceScoreInput => ({
  bundle: bundle(),
  signature: 'valid',
  dwellTargetS: 300,
  skewS: 2,
  uploadDelayH: 0.1,
  hop: null,
  ...over,
});

describe('scoreEvidence', () => {
  it('verifies clean evidence, and unavailable attestation only flags', () => {
    expect(scoreEvidence(input(), DEFAULT_VERIFY_CONFIG).verdict).toBe('verified');
    const soft = scoreEvidence(input({ signature: 'unavailable' }), DEFAULT_VERIFY_CONFIG);
    expect(soft).toMatchObject({ verdict: 'verified', soft: ['attestation_unavailable'] });
  });

  it.each([
    [
      'a simulated location',
      input({ bundle: bundle({ mock_flags: MOCK_FLAG_SIMULATED }) }),
      'mock_location',
    ],
    ['a bad device-key signature', input({ signature: 'invalid' }), 'bad_signature'],
    [
      'a 900 km/h hop with no flight',
      input({ hop: { distance_m: 900_000, seconds: 3600, flightBetween: false } }),
      'impossible_speed',
    ],
    [
      'a dwell short of the rule',
      input({ bundle: bundle({ dwell: { ...bundle().dwell, inside_s: 120 } }) }),
      'short_dwell',
    ],
  ])('revokes %s', (_, scored, signal) => {
    const score = scoreEvidence(scored, DEFAULT_VERIFY_CONFIG);
    expect(score.verdict).toBe('revoked');
    expect(score.hard).toContain(signal);
  });

  it('accepts the same hop when a flight landed between', () => {
    const score = scoreEvidence(
      input({ hop: { distance_m: 900_000, seconds: 3600, flightBetween: true } }),
      DEFAULT_VERIFY_CONFIG,
    );
    expect(score.verdict).toBe('verified');
    expect(score.hop_kmh).toBeCloseTo(900);
  });

  it('accepts an external GPS accessory as a soft signal', () => {
    const score = scoreEvidence(
      input({ bundle: bundle({ mock_flags: MOCK_FLAG_ACCESSORY }) }),
      DEFAULT_VERIFY_CONFIG,
    );
    expect(score).toMatchObject({ verdict: 'verified', soft: ['accessory_gps'] });
  });
});

describe('evidence payload', () => {
  it('is canonical: key order never changes what is signed', () => {
    const one = bundle();
    const two = {
      device_ts: one.device_ts,
      mock_flags: 0,
      dwell: one.dwell,
      samples_hash: one.samples_hash,
    };
    expect(evidenceSigningPayload('e1', one)).toBe(evidenceSigningPayload('e1', two));
    expect(evidenceSigningPayload('e1', one)).not.toBe(evidenceSigningPayload('e2', one));
    expect(evidenceSigningPayload('e1', one)).not.toMatch(/lat|lng/u);
  });

  it('keeps only distance bands', () => {
    expect([3, 10, 11, 49, 51].map(distanceBand)).toEqual([
      '0_10',
      '0_10',
      '10_25',
      '25_50',
      '50_plus',
    ]);
  });
});
