/**
 * Low data for editorial media: the traveller turned auto-download off (Settings > Offline), so
 * heroes load small stills only, never a video loop, and nothing is saved ahead of time.
 */
import { AUTO_ID, AUTO_SQL, autoDownloadOn } from '../bundle/background-prefetch';
import { useLiveRows } from '../hub/data/live-rows';

// eslint-disable-next-line lingui/no-unlocalized-strings -- a table name, never copy.
const TABLES = ['local_private'];

export function useMediaLowData(): boolean {
  return !autoDownloadOn(useLiveRows<{ data: string }>(AUTO_SQL, [AUTO_ID], TABLES).rows);
}
