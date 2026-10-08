/**
 * Where a spoken question goes. Voice mode opens from the guide sheet in the sheet's own mode:
 * on JUST ME what is said is asked in the asker's private thread, whatever the size of the crew.
 * Only a voice screen opened with no mode (a link) works one out: GROUP for a trip with a crew,
 * JUST ME otherwise, as the sheet itself opens.
 */
/* eslint-disable lingui/no-unlocalized-strings -- api paths and wire values, never copy. */
import type { GuideThreadMode } from '@cp/domain';

import { useGuideContext, type GuideContext } from '../chat/data/use-guide-context';
import { useGuideThread } from '../chat/data/use-guide-thread';

export interface VoiceTarget {
  readonly mode: GuideThreadMode;
  readonly tripId: string | null;
  readonly uid: string | null;
  readonly threadId: string;
}

export function voiceThreadMode(given: GuideThreadMode | null, crewSize: number): GuideThreadMode {
  return given ?? (crewSize > 1 ? 'group' : 'private');
}

/** The guide, the trip and the thread voice mode talks in. */
export function useVoiceTarget(
  tripId: string | null,
  given: GuideThreadMode | null,
): { readonly context: GuideContext; readonly target: VoiceTarget } {
  const context = useGuideContext(tripId);
  const trip = context.trip;
  const mode = voiceThreadMode(given, trip?.crewSize ?? 1);
  const thread = useGuideThread(mode, trip?.tripId ?? null, context.uid);
  return {
    context,
    target: { mode, tripId: trip?.tripId ?? null, uid: context.uid, threadId: thread.threadId },
  };
}

/** The turn a spoken question is asked with: the target's thread, in the target's mode. */
export function voiceTurnRequest(target: VoiceTarget, text: string, speak: boolean) {
  return {
    path: `/v1/guide/threads/${target.threadId}/turns`,
    body: {
      text,
      mode: 'voice',
      speak,
      thread_mode: target.mode,
      context: { trip_id: target.tripId, screen: '3j-2' },
    },
  } as const;
}
