/**
 * My work reads: the caller's claimed items by urgency (`/work`), unclaimed items in their areas
 * (`/work/available`), and TAKE / hand back through `claim_work_item` / `release_work_item`.
 */
import { workAvailableSchema, workMineSchema, type AdminArea, type WorkItem } from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { POLL_MS } from '../../kit/table';
import { showSavedToast } from '../../kit/toast';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';

export const WORK_KEY = ['admin', 'work'] as const;

export function useMyWork() {
  return useQuery({
    queryKey: [...WORK_KEY, 'mine'],
    queryFn: () => getJson('/v1/admin/work', workMineSchema),
    refetchInterval: POLL_MS,
  });
}

export function useAvailableWork() {
  return useQuery({
    queryKey: [...WORK_KEY, 'available'],
    queryFn: () => getJson('/v1/admin/work/available', workAvailableSchema),
    refetchInterval: POLL_MS,
  });
}

export function useWorkAction() {
  const me = useOperator();
  const client = useQueryClient();
  return async (action: 'claim' | 'release', item: WorkItem) => {
    const result = await runCommand(
      action === 'claim' ? 'claim_work_item' : 'release_work_item',
      { queue: item.queue, item_id: item.item_id },
      me.uid,
    );
    showSavedToast({ label: action === 'claim' ? 'Taken' : 'Handed back', opId: result.op_id });
    await client.invalidateQueries({ queryKey: WORK_KEY });
    await client.invalidateQueries({ queryKey: ['admin', 'counts'] });
  };
}

/** Where an item opens: its area's page. */
export const AREA_PATH: Readonly<Partial<Record<AdminArea, string>>> = {
  moderation: '/moderation',
  desk: '/desk',
  content: '/content',
  support: '/support',
  billing: '/billing',
  catalogue: '/catalogue',
  jobs: '/jobs',
  flags: '/flags',
  partners: '/partners',
};

/** "2 h late", "38 min", "Mon 09:00": the due column. */
export function dueLabel(dueAt: string | null, now: Date): string {
  if (dueAt === null) return 'no due time';
  const diffMin = Math.round((Date.parse(dueAt) - now.getTime()) / 60_000);
  const abs = Math.abs(diffMin);
  const span = abs < 60 ? `${abs} min` : `${Math.floor(abs / 60)} h ${abs % 60} min`;
  if (diffMin < 0) return `${span} late`;
  if (diffMin <= 120) return `due ${span}`;
  return new Date(dueAt).toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
