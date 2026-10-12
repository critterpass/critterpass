import { useEffect, useState } from 'react';

import type { ChatMessage } from './rows';

/** How long the guide's dots wait for its answer before giving up. */
export const GUIDE_REPLY_WAIT_MS = 45_000;

/**
 * The guide is writing back: a member's message that calls the guide became the newest one while
 * the chat was open. The dots go when anything newer lands (the guide's answer included) or after
 * `GUIDE_REPLY_WAIT_MS`, whichever is first.
 */
export function useGuideReplying(
  messages: readonly ChatMessage[],
  hasGuide: boolean,
  loaded: boolean,
): boolean {
  const newest = messages.at(-1);
  const newestId = newest?.id ?? null;
  const calls = hasGuide && newest?.senderKind === 'user' && newest.mentionsGuide;
  const [opened, setOpened] = useState<string | null | undefined>(undefined);
  const [expired, setExpired] = useState<string | null>(null);
  // What was newest when the chat opened never counts: its answer may be long given.
  if (opened === undefined && loaded) setOpened(newestId);
  const waiting = calls === true && opened !== undefined && newestId !== opened;
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setTimeout(() => setExpired(newestId), GUIDE_REPLY_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting, newestId]);
  return waiting && expired !== newestId;
}
