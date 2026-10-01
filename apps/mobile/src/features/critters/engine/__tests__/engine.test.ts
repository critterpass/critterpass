/**
 * The encounter engine replaying the GPX fixtures in tools/scripts/gpx/critters with no network:
 * the states it goes through, the commands it queues (in order), and that no fix, coordinate or
 * position ever leaves the phone.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_ENCOUNTER_CONFIG,
  evidenceSigningPayload,
  MOCK_FLAG_SIMULATED,
  type EncounterPhase,
} from '@cp/domain';

import type { EngineFix } from '@/lib/location';

import type { SpawnSqlRow } from '../../data/spawn-rows';
import { createEncounterEngine, type EngineCommands } from '../engine';
import { createEvidenceSigner } from '../evidence';
import type { SpawnCandidate } from '../spawn-feed';

const GPX_DIR = join(__dirname, '../../../../../../../tools/scripts/gpx/critters');
const POOLS = { lat: -8.4153, lng: 115.3153 };

function readGpx(name: string): EngineFix[] {
  const text = readFileSync(join(GPX_DIR, `${name}.gpx`), 'utf8');
  const points = [...text.matchAll(/<trkpt lat="([-\d.]+)" lon="([-\d.]+)">(.*?)<\/trkpt>/gu)];
  return points.map((m) => {
    const body = m[3] ?? '';
    return {
      lat: Number(m[1]),
      lng: Number(m[2]),
      at: Date.parse(/<time>(.*?)<\/time>/u.exec(body)?.[1] ?? ''),
      acc: Number(/<cp:accuracy>(.*?)<\/cp:accuracy>/u.exec(body)?.[1] ?? '10'),
      speed: 0.4,
      stationary: false,
      mock: body.includes('<cp:mock>1</cp:mock>') ? MOCK_FLAG_SIMULATED : 0,
    };
  });
}

const RULE: SpawnSqlRow = {
  id: '0192f000-0000-7000-8000-0000000a5a01',
  key: 'tirta-empul-rare',
  form_id: '0192f000-0000-7000-8000-0000000f0011',
  kind: 'presence',
  set_id: '0192f000-0000-7000-8000-0000000051b1',
  destination_id: '0192f000-0000-7000-8000-00000000d201',
  poi_ids: '[]',
  geofences: '[]',
  n: null,
  dwell_s: 300,
  hold_ms: null,
  window_id: null,
  solar: null,
  min_members: null,
  foreground_only: 0,
  copy: 'At a water temple',
  critter_id: '0192f000-0000-7000-8000-0000000c0010',
  rarity: 'rare',
};

const CANDIDATE: SpawnCandidate = {
  rule: RULE,
  spot: {
    poiId: '0192f000-0000-7000-8000-00000000b0a1',
    placeKey: 'pools',
    name: 'Tirta Empul',
    radiusM: null,
    ...POOLS,
  },
  tripId: '0192f000-0000-7000-8000-00000000f201',
};

function replay(name: string, platform = 'android', keyId: string | null = null, limit = Infinity) {
  const queued: { cmd: string; payload: unknown }[] = [];
  const commands: EngineCommands = {
    start: (payload) => queued.push({ cmd: 'start_encounter', payload }),
    report: (payload) => queued.push({ cmd: 'report_encounter_samples', payload }),
    end: (payload) => queued.push({ cmd: 'end_encounter', payload }),
    befriend: (payload) => queued.push({ cmd: 'befriend_critter', payload }),
  };
  let clock = 0;
  let ids = 0;
  const engine = createEncounterEngine({
    now: () => clock,
    config: () => DEFAULT_ENCOUNTER_CONFIG,
    candidates: () => [CANDIDATE],
    commands,
    sign: createEvidenceSigner({
      platform,
      keyId: () => Promise.resolve(keyId),
      generateAssertion: (_key, payload) =>
        Promise.resolve(Buffer.from(`assert:${payload}`).toString('base64')),
    }),
    sha256: (text) => Promise.resolve(createHash('sha256').update(text).digest('hex')),
    uuid: () => `0192f000-0000-7000-8000-${String((ids += 1)).padStart(12, '0')}`,
    online: () => false,
  });
  const phases: EncounterPhase[] = [];
  const seen = (phase: EncounterPhase | 'none') => {
    if (phase !== 'none' && phases[phases.length - 1] !== phase) phases.push(phase);
  };
  for (const fix of readGpx(name).slice(0, limit)) {
    clock = fix.at;
    engine.onFix(fix);
    seen(engine.snapshot().phase);
  }
  return { engine, queued, phases, setClock: (ms: number) => (clock = ms) };
}

describe('encounter engine', () => {
  it('fills the ring at the pools, befriends on the hold and queues it all offline', async () => {
    const { engine, queued, phases } = replay('temple-dwell');
    expect(phases).toEqual(['accruing', 'ready']);
    expect(await engine.befriend('hold')).toBe(true);
    expect(engine.snapshot().phase).toBe('befriended');
    const cmds = queued.map((q) => q.cmd);
    expect(cmds[0]).toBe('start_encounter');
    expect(cmds[cmds.length - 1]).toBe('befriend_critter');
    expect(queued[0]?.payload).toMatchObject({ offline: true, trip_id: CANDIDATE.tripId });
    const befriend = queued[queued.length - 1]?.payload as {
      via: string;
      evidence_bundle: { samples_hash: string; dwell: { count: number; inside_s: number } };
      attestation: { status: string };
    };
    expect(befriend.via).toBe('hold');
    expect(befriend.evidence_bundle.samples_hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(befriend.evidence_bundle.dwell.inside_s).toBeGreaterThanOrEqual(300);
    expect(befriend.attestation).toEqual({
      status: 'unavailable',
      reason: 'keystore_unregistered',
    });
    const reported = queued
      .filter((q) => q.cmd === 'report_encounter_samples')
      .reduce((n, q) => n + (q.payload as { samples: unknown[] }).samples.length, 0);
    expect(reported).toBe(befriend.evidence_bundle.dwell.count);
  });

  it('never lets a coordinate leave the phone', () => {
    const { queued } = replay('temple-dwell');
    const wire = JSON.stringify(queued);
    expect(wire).not.toMatch(/"lat"|"lng"|"lon"|"latitude"|"longitude"/u);
    expect(wire).not.toContain('-8.41');
    expect(wire).not.toContain('115.31');
  });

  it('refuses the hold before the ring is full, and after it is abandoned', async () => {
    const early = replay('temple-dwell', 'android', null, 30);
    expect(early.engine.snapshot().phase).toBe('accruing');
    expect(await early.engine.befriend('hold')).toBe(false);
    early.engine.abandon();
    expect(early.queued.map((q) => q.cmd)).toContain('end_encounter');
    expect(early.queued.find((q) => q.cmd === 'end_encounter')?.payload).toMatchObject({
      outcome: 'abandoned',
    });
    expect(await early.engine.befriend('hold')).toBe(false);
  });

  it('keeps the ring through a short walk away, then wanders off and says so', () => {
    const { queued, phases } = replay('walk-off-return');
    expect(phases).toEqual([
      'accruing',
      'draining',
      'accruing',
      'ready',
      'draining',
      'wandered_off',
    ]);
    const end = queued.find((q) => q.cmd === 'end_encounter')?.payload;
    expect(end).toMatchObject({ outcome: 'wandered_off' });
    expect(queued.some((q) => q.cmd === 'befriend_critter')).toBe(false);
  });

  it('carries the simulated-location flag into the evidence for the server to revoke', async () => {
    const { engine, queued } = replay('mock-teleport');
    await engine.befriend('accessible');
    const befriend = queued.find((q) => q.cmd === 'befriend_critter')?.payload as {
      evidence_bundle: { mock_flags: number };
    };
    expect(befriend.evidence_bundle.mock_flags & MOCK_FLAG_SIMULATED).toBe(MOCK_FLAG_SIMULATED);
  });

  it('signs the evidence on iOS with the attested key, over the canonical payload', async () => {
    const { engine, queued } = replay('temple-dwell', 'ios', 'key-1');
    await engine.befriend('hold');
    const befriend = queued.find((q) => q.cmd === 'befriend_critter')?.payload as {
      encounter_id: string;
      evidence_bundle: Parameters<typeof evidenceSigningPayload>[1];
      attestation: { status: string; key_id: string; signature: string };
    };
    expect(befriend.attestation.status).toBe('signed');
    expect(befriend.attestation.key_id).toBe('key-1');
    expect(Buffer.from(befriend.attestation.signature, 'base64').toString()).toBe(
      `assert:${evidenceSigningPayload(befriend.encounter_id, befriend.evidence_bundle)}`,
    );
  });
});
