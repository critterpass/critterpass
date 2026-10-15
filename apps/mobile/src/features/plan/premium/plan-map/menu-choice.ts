/**
 * How a glass menu lets go. A row's action runs only once the menu has gone: on iOS a share sheet,
 * an alert or a presented screen asked for while the menu is still leaving is dropped by the
 * system, so the action waits for the menu's own dismissal; Android runs it as the menu closes.
 * The menu's owner hears `onClose` first, then the action, so an action that opens something in
 * the menu's place (a stop's details) is not undone by the close.
 */
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

/** Longer than the modal's fade out: past it the menu is gone whether or not it said so. */
export const DISMISSAL_GRACE_MS = 600;

export interface MenuChoice {
  /** Whether the menu is showing (false while it plays its exit). */
  readonly open: boolean;
  /** A row was chosen: the menu leaves, then `action` runs. */
  readonly choose: (action: () => void) => void;
  /** A tap outside or the system back: the menu leaves with nothing run. */
  readonly dismiss: () => void;
  /** The menu has gone (the modal's own dismissal on iOS). */
  readonly dismissed: () => void;
}

export function useMenuChoice(
  onClose: () => void,
  waitsForDismissal: boolean = Platform.OS === 'ios',
): MenuChoice {
  const [open, setOpen] = useState(true);
  const pending = useRef<(() => void) | null>(null);
  const leaving = useRef(false);
  const settled = useRef(false);
  const settle = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    const action = pending.current;
    pending.current = null;
    onClose();
    action?.();
  }, [onClose]);
  const leave = useCallback(
    (action: (() => void) | null) => {
      if (leaving.current) return;
      leaving.current = true;
      pending.current = action;
      setOpen(false);
      if (!waitsForDismissal) settle();
      // The dismissal callback is the menu's own; should it never come, the choice still lands.
      else setTimeout(settle, DISMISSAL_GRACE_MS);
    },
    [settle, waitsForDismissal],
  );
  return {
    open,
    choose: leave,
    dismiss: useCallback(() => leave(null), [leave]),
    dismissed: settle,
  };
}

export interface LiftRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where the lifted card (with its menu under it) sits: the card lifts where the stop was; a menu
 * too tall for the room under the stop rises with its card until it fits above `bottom`, never
 * past `top`. A stop with no place on screen (picked from the map) lifts at `fallback`.
 */
export function liftedTop(input: {
  readonly from: LiftRect | null;
  readonly groupHeight: number;
  readonly screenHeight: number;
  readonly top: number;
  readonly bottom: number;
  readonly fallback: number;
}): number {
  const want = input.from?.y ?? input.fallback;
  const lowest = input.screenHeight - input.bottom - input.groupHeight;
  return Math.max(input.top, Math.min(want, lowest));
}
