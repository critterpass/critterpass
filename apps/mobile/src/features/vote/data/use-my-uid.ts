/** The signed-in uid as the local database knows it (its bound owner); null until bound. */
import { useSessionUid } from '@/data/powersync/use-session-uid';

export function useMyUid(): string | null {
  return useSessionUid();
}
