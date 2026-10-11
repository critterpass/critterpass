/**
 * This person's own shared days for the coming week, as the crew's counts read them
 * (`GET /v1/trips/{id}/my-days`): what the free-days sheet previews as "what the crew sees". Read
 * again after each sync; offline or failed it is null and the preview is left out.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a route path, never copy. */
import { myDaysResultSchema, type MyDaysResult } from '@cp/domain';
import { useEffect, useState } from 'react';

import { useSetupServices } from '../data/services';

export type MyDay = MyDaysResult['days'][number];

export function myDaysPath(tripId: string, start: string): string {
  return `/v1/trips/${encodeURIComponent(tripId)}/my-days?${new URLSearchParams({ start }).toString()}`;
}

/** Today's date where the phone is (`YYYY-MM-DD`). */
export function localToday(now: number): string {
  const at = new Date(now);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function useMyDays(tripId: string, syncedAt: Date | null): readonly MyDay[] | null {
  const services = useSetupServices();
  const start = localToday(services.now());
  const path = myDaysPath(tripId, start);
  const stamp = syncedAt?.getTime() ?? 0;
  const [read, setRead] = useState<{ key: string; days: readonly MyDay[] | null } | null>(null);
  const key = `${path}|${String(stamp)}`;
  useEffect(() => {
    let live = true;
    void services.getJson(path).then((answer) => {
      if (!live) return;
      const parsed = answer.kind === 'ok' ? myDaysResultSchema.safeParse(answer.body) : null;
      setRead({ key, days: parsed?.success === true ? parsed.data.days : null });
    });
    return () => {
      live = false;
    };
  }, [services, path, key]);
  return read?.days ?? null;
}
