/**
 * On the PASS tab while an encounter is under way: where it is and how full the ring is, opening
 * the encounter. `LiveEncounterBanner` follows the engine itself, so its once-a-second progress
 * redraws the banner and never the dex around it.
 */
import { router } from 'expo-router';
import type { ComponentType } from 'react';

import { useEncounter } from '../engine/use-encounter';
import { encounterRoute } from '../routes';

const LIVE = new Set(['accruing', 'ready', 'draining']);

export interface EncounterBannerModel {
  readonly place: string;
  readonly progress: number;
  readonly onOpen: () => void;
}

/** The banner over the session's encounter, drawn by `Banner`; nothing while none is under way. */
export function LiveEncounterBanner({
  Banner,
}: {
  readonly Banner: ComponentType<{ readonly banner: EncounterBannerModel }>;
}) {
  const { snapshot } = useEncounter();
  const encounterId = snapshot.encounterId;
  if (!LIVE.has(snapshot.phase) || encounterId === null) return null;
  return (
    <Banner
      banner={{
        place: snapshot.candidate?.spot.name ?? '',
        progress: snapshot.progress,
        onOpen: () => router.push(encounterRoute(encounterId)),
      }}
    />
  );
}
