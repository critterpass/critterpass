/**
 * Guide lab scenes for a thread's edges: a long group thread (its latest page at the end, Earlier
 * messages above it) and an answer the asker stopped.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture copy, only in the (dev) lab. */
import { useMemo, useState, type ReactNode } from 'react';

import { earlierPin, windowStart } from '../data/thread-window';
import { TURN_STOPPED } from '../data/turn-state';
import { answer, LAB_MAYA, LAB_ME, LabSheet, live, question } from './lab-scenes-chat';

const PAIRS = 40;

function LongThread() {
  const all = useMemo(
    () =>
      Array.from({ length: PAIRS }, (_, index) => [
        question(
          `long-q${index}`,
          `Question ${index + 1}: what is open near the hotel?`,
          index % 3 === 0 ? LAB_MAYA : LAB_ME,
        ),
        answer(
          `long-a${index}`,
          `Answer ${index + 1}: the warung on the corner, till ten. Two minutes on foot.`,
        ),
      ]).flat(),
    [],
  );
  const [pin, setPin] = useState<string | null>(null);
  const start = windowStart(all, pin);
  return (
    <LabSheet
      messages={all.slice(start)}
      {...(start > 0 ? { onEarlier: () => setPin(earlierPin(all, start)) } : {})}
    />
  );
}

export const THREAD_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'chat-long-thread': () => <LongThread />,
  'chat-stopped': () => (
    <LabSheet
      live={live({
        phase: 'error',
        text: 'Rain till about three. Here’s a dry',
        errorCode: TURN_STOPPED,
        retryable: true,
      })}
    />
  ),
};
