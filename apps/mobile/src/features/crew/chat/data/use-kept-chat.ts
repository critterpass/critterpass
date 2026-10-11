/**
 * A former member reading the crew chat they kept: "Ask to rejoin" posts a line for the organisers
 * (at most once a day, the server decides), and "Remove chat" stops the chat syncing to their
 * phones. Both wait in the offline queue.
 */
import { useCallback } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { askToRejoinCommand, removeKeptChatCommand } from './chat-commands';

export function useKeptChat(crewId: string) {
  const { commands } = useLocalFirst();
  const askToRejoin = useCallback(
    () => commands.send(askToRejoinCommand, { crew_id: crewId }),
    [commands, crewId],
  );
  const removeChat = useCallback(
    () => commands.send(removeKeptChatCommand, { crew_id: crewId }),
    [commands, crewId],
  );
  return { askToRejoin, removeChat };
}
