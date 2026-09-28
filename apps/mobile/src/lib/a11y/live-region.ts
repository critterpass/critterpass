import { Platform } from 'react-native';
import type { AccessibilityProps } from 'react-native';

import { announce } from './announce';

export type Politeness = 'polite' | 'assertive';

/**
 * Props for a view whose text changes should be read out. Android reads `accessibilityLiveRegion`
 * itself; iOS has no live regions, so callers pair these props with `announceChange` when the
 * content changes.
 */
export function liveRegion(politeness: Politeness = 'polite'): AccessibilityProps {
  return Platform.OS === 'android' ? { accessibilityLiveRegion: politeness } : {};
}

/**
 * Announces changed live content on iOS (Android's live region already speaks it). `assertive`
 * interrupts the current utterance, `polite` queues behind it.
 */
export function announceChange(message: string, politeness: Politeness = 'polite'): void {
  if (Platform.OS === 'android') return;
  announce(message, { queue: politeness === 'polite' });
}
