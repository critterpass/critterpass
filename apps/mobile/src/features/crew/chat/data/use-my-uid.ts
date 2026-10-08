/**
 * The signed-in uid as the local database knows it (the owner it was bound to at sign-in), so chat
 * hooks can tell "mine" from "theirs" without waiting on the auth layer. Null until bound.
 */
import { useSessionUid } from '@/data/powersync/use-session-uid';

export function useMyUid(): string | null {
  return useSessionUid();
}
