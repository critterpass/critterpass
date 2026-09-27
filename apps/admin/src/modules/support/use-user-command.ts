import { useQueryClient } from '@tanstack/react-query';

import { runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';
import type { SupportAction } from './action-dialog';

export type OpenAction = (action: SupportAction) => void;

/** Runs one audited support command for a user, then refreshes that user's detail. */
export function useUserCommand(uid: string) {
  const me = useOperator();
  const client = useQueryClient();
  return async (cmd: string, payload: Record<string, unknown>) => {
    await runCommand(cmd, { uid, ...payload }, me.uid);
    await client.invalidateQueries({ queryKey: ['support', 'user', uid] });
  };
}
