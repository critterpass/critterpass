/**
 * The signed-in operator (`GET /v1/admin/me`), shared by the shell, navigation and every command
 * (the envelope's `actor.uid`). A 401 means "sign in"; a 403 means signed in but not allowed.
 */
import { adminMeSchema, type AdminMe } from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getJson, postAuth } from './api';

export const ME_QUERY_KEY = ['admin', 'me'] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => getJson('/v1/admin/me', adminMeSchema),
    retry: false,
    staleTime: 60_000,
  });
}

/** For components rendered inside the signed-in shell only. */
export function useOperator(): AdminMe {
  const me = useMe();
  if (me.data === undefined) throw new Error('useOperator outside the signed-in shell');
  return me.data;
}

export function useSignOut(): () => Promise<void> {
  const client = useQueryClient();
  return async () => {
    await postAuth('/sign-out', {}).catch(() => undefined);
    client.clear();
    window.location.assign('/sign-in');
  };
}
