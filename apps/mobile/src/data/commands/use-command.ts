/**
 * `useCommand(spec)` → `{send, pending}`: the one way screens write. Offline-capable commands
 * resolve as soon as they are queued (with their optimistic rows visible); online-only commands
 * resolve with the server's answer.
 */
import { useCallback, useState } from 'react';

import { useLocalFirst } from '../powersync/local-first-context';
import type { SendOptions, SendResult } from './client';
import type { ClientCommandSpec } from './summaries';

export function useCommand<Payload>(spec: ClientCommandSpec<Payload>) {
  const { commands } = useLocalFirst();
  const [inFlight, setInFlight] = useState(0);

  const send = useCallback(
    async (payload: Payload, options?: SendOptions): Promise<SendResult> => {
      setInFlight((n) => n + 1);
      try {
        return await commands.send(spec, payload, options);
      } finally {
        setInFlight((n) => n - 1);
      }
    },
    [commands, spec],
  );

  return { send, pending: inFlight > 0 };
}
