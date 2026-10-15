import { useEffect } from 'react';

import { scheduleLayoutScan } from './layout-scan';
import { holdForEntrance } from './layout-settled';
import { UI_QA_ENABLED } from './ui-qa';

/** The longest a screen holds the scan when its navigator never says it has arrived. */
export const ENTRANCE_CAP_MS = 4000;

/** The part of a screen's navigation object the hold listens on. */
export interface EnteringNavigation {
  readonly addListener?: (event: 'transitionEnd', listener: () => void) => () => void;
}

/**
 * Holds the screen-wide layout checks from the moment a stack screen mounts until its navigator
 * says it has arrived (`transitionEnd`), then has them look at it. The native stack can show a
 * push well after React laid it out (the page under it still busy, a map drawing): measured
 * before then, a scroll view under the transparent bar had no system inset yet and its first card
 * read as drawn under the status bar. Development and e2e builds only.
 */
export function useScanOnArrival(navigation: EnteringNavigation): void {
  useEffect(() => {
    if (!UI_QA_ENABLED || navigation.addListener === undefined) return undefined;
    const release = holdForEntrance();
    let arrived = false;
    const arrive = () => {
      if (arrived) return;
      arrived = true;
      clearTimeout(cap);
      off();
      release();
      scheduleLayoutScan();
    };
    const cap = setTimeout(arrive, ENTRANCE_CAP_MS);
    const off = navigation.addListener('transitionEnd', arrive);
    return () => {
      clearTimeout(cap);
      off();
      release();
    };
  }, [navigation]);
}
