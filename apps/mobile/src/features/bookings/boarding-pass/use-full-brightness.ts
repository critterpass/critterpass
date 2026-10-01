/**
 * Full screen brightness while a pass is on screen, so the gate reader catches the code: the
 * app's own window brightness goes to maximum on mount and back to what it was on unmount (the
 * system setting is never touched, so no permission is asked). A build without the native module
 * leaves the brightness alone.
 */
import { requireOptionalNativeModule } from 'expo';
import type * as BrightnessModule from 'expo-brightness';
import { useEffect } from 'react';

function brightness(): typeof BrightnessModule | null {
  if (requireOptionalNativeModule('ExpoBrightness') === null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native-module load
  return require('expo-brightness') as typeof BrightnessModule;
}

export function useFullBrightness(active: boolean): void {
  useEffect(() => {
    const module = active ? brightness() : null;
    if (module === null) return undefined;
    let previous: number | null = null;
    let released = false;
    void (async () => {
      try {
        const current = await module.getBrightnessAsync();
        if (released) return;
        previous = current;
        await module.setBrightnessAsync(1);
      } catch {
        // Brightness is a courtesy; the pass still shows.
      }
    })();
    return () => {
      released = true;
      if (previous !== null) void module.setBrightnessAsync(previous).catch(() => undefined);
    };
  }, [active]);
}
