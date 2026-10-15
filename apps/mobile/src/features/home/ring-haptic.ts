/**
 * Home's header (3b-2, 3b-6): "HEY {NAME} ›" to the profile, the crew switcher ▾ (the crews sheet),
 * the crew pill (member faces, chat, unread from the chat) and the bell with the needs-you count.
 * The bell rings once, with a light haptic, whenever the count goes up, and an arrival that needs
 * the user (placed ideas, a plan to answer, a crewmate's answer) is said once as a toast.
 */

import { useEffect, useRef } from 'react';

import { impact } from '@/motion/feedback';

/** A light haptic when the needs-you count goes up (the bell's ring is drawn by the header). */
export function useRingHaptic(count: number): void {
  const last = useRef(count);
  useEffect(() => {
    if (count > last.current) impact('bell');
    last.current = count;
  }, [count]);
}
