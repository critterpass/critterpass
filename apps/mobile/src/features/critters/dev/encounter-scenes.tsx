/**
 * Lab scenes for encounters: filling, ready, stepped away (3l-4), a legendary (3l-10), wandered off
 * with and without a crowd forecast (3l-5), befriended (3l-6) and nothing nearby. The hold ring and
 * links are live but do nothing. The live scenes run the real camera guard.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { findDesignedForm } from '@cp/critter-art';
import type { ReactNode } from 'react';

import type { SpawnArt } from '../encounter/encounter-model';
import { EncounterView, type EncounterViewProps } from '../encounter/encounter-view';
import { LiveCamera } from '../encounter/live-camera';
import { goBackOr } from '@/lib/navigation/back';

const noop = () => undefined;

const TEMPLE: SpawnArt = {
  key: 'cp-112',
  seed: 7,
  form: findDesignedForm('cp-112', 'rare')?.form ?? null,
  rarity: 'rare',
  xp: 150,
  name: 'Tokek',
  formNo: 2,
  formCount: 4,
};

const SAKURA: SpawnArt = {
  key: 'cp-061',
  seed: 7,
  form: findDesignedForm('cp-061', 'legendary')?.form ?? null,
  rarity: 'legendary',
  xp: 1000,
  name: null,
  formNo: 4,
  formCount: 4,
};

const FORECAST = {
  when: 'Tomorrow, 07:30',
  remind: '07:00',
  bars: [20, 12, 28, 45, 60, 70, 72, 66, 58, 44, 40, 30, 26],
  litIndex: 1,
  hours: ['6am', 'noon', '6pm'] as const,
};

type LiveProps = Extract<EncounterViewProps, { kind: 'live' | 'wandered' }>;

function live(overrides: Partial<LiveProps> = {}) {
  return (
    <EncounterView
      kind="live"
      place="Tirta Empul"
      habitat="Water temples only"
      art={TEMPLE}
      phase="accruing"
      progress={0.45}
      legendary={false}
      crewLine="Maya befriended one here."
      minutes={4}
      forecast={FORECAST}
      onHold={noop}
      onTap={noop}
      onRemind={noop}
      onBack={noop}
      onLeave={() => goBackOr()}
      // The real camera guard: on a phone with a camera the preview shows; without one (a
      // simulator, a refused permission) the illustration stays.
      camera={<LiveCamera />}
      {...overrides}
    />
  );
}

export const ENCOUNTER_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3l-4-filling': () => live(),
  '3l-4-ready': () => live({ phase: 'ready', progress: 1 }),
  '3l-4-stepped-away': () => live({ phase: 'draining', progress: 0.7 }),
  '3l-4-unknown-name': () => live({ art: { ...TEMPLE, name: null }, crewLine: null }),
  '3l-10-legendary': () =>
    live({
      place: 'the big cherry',
      habitat: 'Blossom week only',
      art: SAKURA,
      legendary: true,
      phase: 'ready',
      progress: 1,
      crewLine: 'Rin spotted it first.',
    }),
  '3l-5-wandered': () => live({ kind: 'wandered' as const, phase: 'wandered_off', progress: 0 }),
  '3l-5-no-forecast': () =>
    live({ kind: 'wandered' as const, phase: 'wandered_off', progress: 0, forecast: null }),
  '3l-6-befriended': () => (
    <EncounterView
      kind="befriended"
      art={TEMPLE}
      eyebrow="Rare form · 2 of 4"
      formChip="Temple Tokek"
      crewChip="2 in the crew"
      minutes={11}
      onAdd={noop}
      onShare={noop}
    />
  ),
  '3l-4-nothing': () => <EncounterView kind="nothing" onBack={noop} />,
};
