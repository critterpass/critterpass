/**
 * "Nothing typed is lost" (foundations-spec §1): a sheet with edits asks before it goes. Swiping it
 * down, Cancel and the system back all ask; the sheet's own verb (Save, Post, Add) does not, since
 * that is the edits being kept.
 */
import { usePreventRemove } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { confirmAlert } from './alerts';

export type SheetLeaveDecision = 'leave' | 'ask';

export interface SheetLeaveInputs {
  /** Edits not yet saved. */
  readonly dirty: boolean;
  /** The sheet's verb is running: the edits are being kept, not dropped. */
  readonly committing: boolean;
}

export function sheetLeaveDecision({ dirty, committing }: SheetLeaveInputs): SheetLeaveDecision {
  return dirty && !committing ? 'ask' : 'leave';
}

export interface DiscardPrompt {
  /** The question ("Discard this booking?"). */
  readonly title: string;
  /** What happens ("What you typed goes."). */
  readonly message: string;
  /** The destructive choice ("Discard"). */
  readonly discard: string;
  /** Stay on the sheet ("Keep editing"). */
  readonly keep: string;
}

/** Asks the discard question; resolves true when the person chose to discard. */
export function askToDiscard(prompt: DiscardPrompt): Promise<boolean> {
  return confirmAlert({
    title: prompt.title,
    message: prompt.message,
    confirm: prompt.discard,
    cancel: prompt.keep,
  });
}

export interface DirtySheetGuard {
  /** Run the sheet's verb: leaving afterwards does not ask. */
  readonly commit: (verb: () => void | Promise<void>) => Promise<void>;
  /**
   * Leaves the sheet after its verb kept the edits: the hold comes off first and `go` (usually
   * `router.back()`) runs once it is off, so the removal it starts is never caught as a discard,
   * whenever the navigator reports it.
   */
  readonly leave: (go: () => void) => void;
}

/**
 * Holds a dirty sheet on screen: a swipe down, Cancel (a `router.back()`) or the system back asks
 * first, and only "Discard" lets it go. On iOS the native sheet stays up while it asks.
 */
export function useDirtySheetGuard(dirty: boolean, prompt: DiscardPrompt): DirtySheetGuard {
  const committing = useRef(false);
  // Once the person discarded (or the verb kept the edits) the sheet is on its way out: the guard
  // stands down, so the removal it lets through does not ask a second time.
  const [released, setReleased] = useState(false);
  const promptRef = useRef(prompt);
  useEffect(() => {
    promptRef.current = prompt;
  });

  usePreventRemove(dirty && !released, ({ repeat }) => {
    // `repeat` drops the hold, then replays the removal the guard held back. Dispatching the held
    // action by hand is held again (and asks again) while the guard is still up.
    const leave = () => {
      setReleased(true);
      repeat();
    };
    if (sheetLeaveDecision({ dirty, committing: committing.current }) === 'leave') {
      leave();
      return;
    }
    void askToDiscard(promptRef.current).then((discard) => {
      if (discard) leave();
    });
  });

  const commit = useCallback(async (verb: () => void | Promise<void>) => {
    committing.current = true;
    try {
      await verb();
    } finally {
      committing.current = false;
    }
  }, []);

  // `leave` asks for the hold to come off and keeps `go` until the render that took it off.
  const pendingLeave = useRef<(() => void) | null>(null);
  const holding = dirty && !released;
  const holdingRef = useRef(holding);
  useEffect(() => {
    holdingRef.current = holding;
    if (holding || pendingLeave.current === null) return;
    const go = pendingLeave.current;
    pendingLeave.current = null;
    // The navigator learns that the hold is off on its own next render: go one frame later.
    const frame = requestAnimationFrame(go);
    return () => cancelAnimationFrame(frame);
  }, [holding]);
  const leave = useCallback((go: () => void) => {
    if (!holdingRef.current) {
      go();
      return;
    }
    pendingLeave.current = go;
    setReleased(true);
  }, []);

  return { commit, leave };
}
