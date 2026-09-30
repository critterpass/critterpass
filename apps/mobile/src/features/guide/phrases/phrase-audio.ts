/**
 * Recorded phrase audio (the guide's voice, pre-rendered): kept on the device once fetched so a
 * card plays in airplane mode. A card whose audio is not on the device yet fetches it through a
 * signed read URL on first play; offline, it can only be shown.
 */
import { createContext, useContext } from 'react';

export interface PhrasePlayback {
  stop(): void;
}

export interface PhraseAudioServices {
  /** The audio already on the device for this key, or null. */
  readonly local: (audioKey: string) => string | null;
  /** Fetches the audio onto the device; null when it cannot (offline, not readable). */
  readonly fetch: (audioKey: string) => Promise<string | null>;
  /** Plays a local file; `onEnd` fires when it finishes. */
  readonly play: (uri: string, onEnd: () => void) => PhrasePlayback;
}

/** Without device services nothing is on the device and nothing can be fetched. */
const none: PhraseAudioServices = {
  local: () => null,
  fetch: () => Promise.resolve(null),
  play: (_uri, onEnd) => {
    onEnd();
    return { stop: () => undefined };
  },
};

let installed: PhraseAudioServices = none;

/** The app installs the device services once at startup (../chat/register.ts). */
export function providePhraseAudio(services: PhraseAudioServices): void {
  installed = services;
}

/** Tests and the (dev) lab provide their own services; everywhere else uses the installed ones. */
export const PhraseAudioContext = createContext<PhraseAudioServices | null>(null);

export function usePhraseAudioServices(): PhraseAudioServices {
  return useContext(PhraseAudioContext) ?? installed;
}

/** Fetches every card's audio that is not on the device yet (the trip's offline pack). */
export async function prefetchPhraseAudio(
  services: PhraseAudioServices,
  audioKeys: readonly string[],
): Promise<number> {
  let fetched = 0;
  for (const key of new Set(audioKeys)) {
    if (services.local(key) !== null) continue;
    if ((await services.fetch(key)) !== null) fetched += 1;
  }
  return fetched;
}
