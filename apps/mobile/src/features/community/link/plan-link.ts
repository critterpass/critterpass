/**
 * A plan link (`/p/{token}`) opened in the app: the link carries a token, the plan screen wants the
 * published plan's id, so the token is asked of the api first (`GET /v1/public/plan/{token}`).
 * Always asked fresh: a link the crew switched off must stop opening the plan.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { publicPlanSchema } from '@cp/domain';
import { useCallback, useEffect, useState } from 'react';

import { useTravelDataReader, type TravelDataReader } from '@/data/travel-data/client';

const answerSchema = publicPlanSchema.pick({ shared_plan_id: true });

export type PlanLinkState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'plan'; readonly sharedPlanId: string }
  /** Revoked, taken down, never a plan link: nothing to open, and asking again will not help. */
  | { readonly kind: 'gone' }
  /** No answer (offline, the api is down): worth another try. */
  | { readonly kind: 'unreachable' };

export function planLinkPath(token: string): string {
  return `/v1/public/plan/${encodeURIComponent(token)}`;
}

export async function resolvePlanLink(
  reader: TravelDataReader | null,
  token: string,
  signal?: AbortSignal,
): Promise<PlanLinkState> {
  if (reader === null) return { kind: 'unreachable' };
  let response;
  try {
    response = await reader.getJson(planLinkPath(token), signal);
  } catch {
    return { kind: 'unreachable' };
  }
  if (response.status === 404) return { kind: 'gone' };
  if (response.status < 200 || response.status >= 300) return { kind: 'unreachable' };
  const parsed = answerSchema.safeParse(response.body);
  return parsed.success
    ? { kind: 'plan', sharedPlanId: parsed.data.shared_plan_id }
    : { kind: 'gone' };
}

export function usePlanLink(token: string) {
  const reader = useTravelDataReader();
  const [answer, setAnswer] = useState<{ key: string; state: PlanLinkState } | null>(null);
  const [round, setRound] = useState(0);
  const key = `${token}\u0000${String(round)}`;
  useEffect(() => {
    const controller = new AbortController();
    void resolvePlanLink(reader, token, controller.signal).then((state) => {
      if (!controller.signal.aborted) setAnswer({ key, state });
    });
    return () => controller.abort();
  }, [reader, token, key]);
  const retry = useCallback(() => setRound((value) => value + 1), []);
  const state: PlanLinkState = answer?.key === key ? answer.state : { kind: 'loading' };
  return { state, retry };
}
