/**
 * Whether the current screen shows as a native sheet, and the insets its own layout should keep.
 * A screen built edge to edge (a pass, a phrase card, the camera) sits under the status bar as a
 * full-screen cover, but in a tall sheet its top is the sheet's top edge, under the grabber: the
 * window's status-bar inset there would push its ✕ and content far down.
 */
import { Platform } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { useScreenPlacement } from './use-screen-placement';

/** The band at the top of a sheet that the grabber sits in (the system's on iOS). */
export const SHEET_TOP_CLEARANCE = 12;

/**
 * True when the screen shows as a native sheet: its own stack or its group (iOS) presented it as
 * one. The first screen of a group presented as a sheet rises as a page on Android (the native
 * sheet can't hold a stack). Outside a navigator (tests, the gallery) it is a sheet.
 */
export function useShownAsSheet(): boolean {
  const placement = useScreenPlacement();
  if (placement === undefined) return true;
  if (placement.kind !== 'presented' || placement.presentation.kind !== 'sheet') return false;
  return placement.ownStack || Platform.OS === 'ios';
}

/**
 * The safe-area insets for a screen's own layout: the window's, with the top replaced by the
 * grabber's band when it shows as a sheet. Outside a navigator it keeps the window's.
 */
export function useScreenInsets(): EdgeInsets {
  const insets = useSafeAreaInsets();
  const placement = useScreenPlacement();
  const sheet = useShownAsSheet();
  if (placement === undefined || !sheet) return insets;
  return { ...insets, top: SHEET_TOP_CLEARANCE };
}
