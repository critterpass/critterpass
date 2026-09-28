/**
 * The guide's read of the inviter's note: once the inviter pauses typing a friend's name and a
 * note, the api suggests up to three taste tags and a line. Nothing is applied until the inviter
 * taps "Use these"; an answer for an older note is dropped, and an unreachable api shows nothing
 * (the chips stay the inviter's own).
 */
import type { InviteTagsResponse } from '@cp/domain';
import { useEffect, useState } from 'react';

import { useCrewServices } from '../crews-sheet/crew-services';

export const SUGGEST_AFTER_MS = 800;
const NOTE_MIN = 3;

export interface TagSuggestionInput {
  readonly enabled: boolean;
  readonly crewId: string;
  readonly tripId: string | null;
  readonly name: string;
  readonly note: string;
}

export function useTagSuggestion(input: TagSuggestionInput): InviteTagsResponse | null {
  const services = useCrewServices();
  const [answer, setAnswer] = useState<{ key: string; value: InviteTagsResponse } | null>(null);
  const name = input.name.trim();
  const note = input.note.trim();
  const ready = input.enabled && input.crewId !== '' && name !== '' && note.length >= NOTE_MIN;
  const key = JSON.stringify([input.crewId, input.tripId, name, note]);

  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      void services
        .inviteTags({
          crew_id: input.crewId,
          ...(input.tripId === null ? {} : { trip_id: input.tripId }),
          note,
          invitee_name: name,
        })
        .then((value) => {
          if (live && value !== null) setAnswer({ key, value });
        });
    }, SUGGEST_AFTER_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `key` carries every input the request is built from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, services]);

  return ready && answer?.key === key ? answer.value : null;
}
