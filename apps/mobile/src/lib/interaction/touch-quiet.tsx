/**
 * When the person last touched the screen. Anything that rises by itself (the arrival welcome,
 * the visit offer) waits until the screen has been left alone for a while, so it never lands on
 * a tap she has just made (a row she opened, a back she pressed, "I'm here").
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

let lastTouchAt = 0;

export function markTouch(at: number = Date.now()): void {
  lastTouchAt = at;
}

/** Milliseconds since the last touch anywhere in the app (a large number before any). */
export function msSinceTouch(now: number = Date.now()): number {
  return lastTouchAt === 0 ? Number.MAX_SAFE_INTEGER : now - lastTouchAt;
}

/** The screen has been left alone for `quietMs`. */
export function isTouchQuiet(quietMs: number, now: number = Date.now()): boolean {
  return msSinceTouch(now) >= quietMs;
}

/** Test-only: the clock is module state. */
export function resetTouchForTests(): void {
  lastTouchAt = 0;
}

/**
 * Wraps the app's screens and notes every touch on its way down; it never takes one (a capture
 * that answers no), so every control below behaves as before.
 */
export function TouchQuietRoot({ children }: { readonly children: ReactNode }) {
  return (
    <View
      style={styles.fill}
      onStartShouldSetResponderCapture={() => {
        markTouch();
        return false;
      }}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
