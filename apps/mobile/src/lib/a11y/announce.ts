import { AccessibilityInfo } from 'react-native';

export interface AnnounceOptions {
  /**
   * Wait for the current utterance to finish instead of interrupting it (iOS). Streaming text and
   * countdown ticks queue; SOS and errors interrupt.
   */
  readonly queue?: boolean;
}

/** Speaks `message` through VoiceOver / TalkBack when a screen reader is running. */
export function announce(message: string, { queue = false }: AnnounceOptions = {}): void {
  if (!message) return;
  if (queue) {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
    return;
  }
  AccessibilityInfo.announceForAccessibility(message);
}
