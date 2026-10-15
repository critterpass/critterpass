/**
 * Sits at the app root and tells the screens that wait for it when the native launch screen has
 * gone (a link notice, the first page's entrance). The launch itself plays in the premium launch.
 */
import { useEffect } from 'react';

import { markSplashRevealed } from './launch-state';

export interface LaunchHatchProps {
  /** True once the root layout hides the native launch screen. */
  readonly revealed: boolean;
}

/** Mounted once at the app root, beside the other overlay hosts. Draws nothing. */
export function LaunchHatch({ revealed }: LaunchHatchProps) {
  useEffect(() => {
    if (revealed) markSplashRevealed();
  }, [revealed]);
  return null;
}
