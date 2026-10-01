/**
 * A crew co-presence legendary on the trip's `trip_copresence` channel: "3 of 6 here" counts and
 * who hasn't been there yet (participation, never where anyone is). When the crew grant lands,
 * everyone sees it at once; the entries themselves arrive through sync.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and channel names, never copy. */
import { copresenceProgressSchema, CRITTERS_RT } from '@cp/domain';
import { useMemo, useState } from 'react';

import { useChannel } from '@/data/realtime/use-channel';
import { impact, toast } from '@/motion';

import { useLiveRows } from '../data/live-rows';
import {
  COPRESENCE_RULES_SQL,
  COPRESENCE_RULES_TABLES,
  type Copresence,
  type CopresenceRuleRow,
} from '../legendary/legendary-model';
import { copresenceDone } from '../legendary/legendary-copy';

const NAMES_SQL = `SELECT id, display_name FROM users`;

interface Progress {
  readonly here: number;
  readonly needed: number;
  readonly missing: readonly string[];
}

/** Co-presence progress by legendary window id, for the trip under way. */
export function useCopresence(tripId: string | null): ReadonlyMap<string, Copresence> {
  const rules = useLiveRows<CopresenceRuleRow>(
    COPRESENCE_RULES_SQL,
    [],
    COPRESENCE_RULES_TABLES,
  ).rows;
  const users = useLiveRows<{ id: string; display_name: string | null }>(
    NAMES_SQL,
    [],
    ['users'],
  ).rows;
  const [byRule, setByRule] = useState<ReadonlyMap<string, Progress>>(new Map());
  useChannel('trip_copresence', tripId, {
    onEvent: (envelope) => {
      if (envelope.type === CRITTERS_RT.copresenceCompleted) {
        impact('thud.heavy');
        toast.show({ id: `critters-copresence-${envelope.id}`, title: copresenceDone() });
        return;
      }
      if (envelope.type !== CRITTERS_RT.copresence) return;
      const progress = copresenceProgressSchema.safeParse(envelope.data);
      if (!progress.success) return;
      const { rule_id, here, needed, missing } = progress.data;
      setByRule((prev) => new Map(prev).set(rule_id, { here, needed, missing }));
    },
  });
  return useMemo(() => {
    const names = new Map(users.map((u) => [u.id, u.display_name ?? '']));
    const out = new Map<string, Copresence>();
    for (const rule of rules) {
      const p = byRule.get(rule.id);
      if (p === undefined) continue;
      out.set(rule.window_id, {
        here: p.here,
        needed: p.needed,
        missing: p.missing.map((id) => names.get(id) ?? '').filter(Boolean),
      });
    }
    return out;
  }, [rules, users, byRule]);
}
