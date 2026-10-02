/**
 * Who is typing in a crew chat, by first name, over the realtime channel (`crew_chat:{crew}`):
 * the shared typing hook throttles this device to one event per 3 s and lets a peer fade 5 s after
 * their last one. `notifyTyping` goes on every keystroke.
 */
import { useMemo } from 'react';

import { useTyping } from '@/data/realtime/use-typing';
import { formerMemberLabel } from '@/ui/people/member-name';

export interface ChatTyping {
  readonly names: readonly string[];
  readonly notifyTyping: () => void;
}

export function firstName(name: string | null | undefined): string | null {
  // "Former member" is one name, not a first and a last.
  if (name?.trim() === formerMemberLabel()) return formerMemberLabel();
  const first = name?.trim().split(/\s+/u)[0];
  return first === undefined || first === '' ? null : first;
}

export function useChatTyping(
  crewId: string,
  namesByUid: ReadonlyMap<string, string | null>,
): ChatTyping {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a channel namespace, not copy.
  const { typing, notifyTyping } = useTyping('crew_chat', crewId);
  const names = useMemo(
    () =>
      typing.flatMap((uid) => {
        const name = firstName(namesByUid.get(uid));
        return name === null ? [] : [name];
      }),
    [typing, namesByUid],
  );
  return { names, notifyTyping };
}
