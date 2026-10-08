/**
 * Live local queries for quests: a query runs now and again whenever one of its tables changes;
 * `null` params skip it until a value it needs is known. Also the uid the local database is bound
 * to (the signed-in member). Both are the app's shared hooks.
 */
import { useSessionUid } from '@/data/powersync/use-session-uid';

export {
  useQuietLiveRows as useLiveRows,
  type QuietLiveRows as LiveRows,
} from '@/data/powersync/live-rows';

/** The signed-in uid as the local database knows it; null until bound. */
export function useOwnerUid(): string | null {
  return useSessionUid();
}
