/**
 * "Nothing typed is lost" (foundations-spec §1): a sheet with edits asks before it goes. Swiping it
 * down, Cancel and the system back all ask; the sheet's own verb (Save, Post, Add) does not, since
 * that is the edits being kept.
 */
import { useNavigation, usePreventRemove } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

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
}

/**
 * Holds a dirty sheet on screen: a swipe down, Cancel (a `router.back()`) or the system back asks
 * first, and only "Discard" lets it go. On iOS the native sheet stays up while it asks.
 */
export function useDirtySheetGuard(dirty: boolean, prompt: DiscardPrompt): DirtySheetGuard {
  const navigation = useNavigation();
  const committing = useRef(false);
  const promptRef = useRef(prompt);
  useEffect(() => {
    promptRef.current = prompt;
  });

  usePreventRemove(dirty, ({ data }) => {
    // The removal the guard held back, now let through.
    const leave = () => navigation.dispatch(data.action);
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

  return { commit };
}
