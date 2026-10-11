/**
 * The rate card's state for either UI (6g-1, 6.24) for one of the trip's drivers. The answer may wait in the offline queue; the
 * server takes it once the trip has ended and the member's phone is verified.
 */
import type { DriverTag, DriverVerdict } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';
import { feedback, toast } from '@/motion';

import { rateDriverCommand } from '../ours/commands';
import { driverRoutes } from '../ours/routes';
import { useOurDrivers } from '../ours/use-our-drivers';
import type { RateDriverViewProps } from './RateDriverView';

export function useRateDriver({
  tripId,
  providerId,
}: {
  readonly tripId: string;
  readonly providerId: string;
}) {
  const { t } = useLingui();
  const { data, offline, failed, reload } = useOurDrivers(tripId);
  const rate = useCommand(rateDriverCommand);
  const [verdict, setVerdict] = useState<DriverVerdict | null>(null);
  const [tags, setTags] = useState<readonly DriverTag[]>([]);
  const [tip, setTip] = useState('');
  const [saved, setSaved] = useState(false);
  const driver = data?.drivers.find((row) => row.provider_id === providerId);
  const backLabel = t({ id: 'drivers.rate.back', message: 'Our drivers' });
  const parent = driverRoutes.ours(tripId);
  if (data === null) {
    if (offline || failed) return { kind: 'failed', offline, reload, backLabel, parent } as const;
    return { kind: 'loading', offline, reload, backLabel, parent } as const;
  }
  if (driver === undefined) return { kind: 'missing', backLabel, parent } as const;

  const chosen = verdict ?? driver.my_verdict;
  async function onSave() {
    if (chosen === null || rate.pending) return;
    const result = await rate.send({
      trip_id: tripId,
      provider_id: providerId,
      verdict: chosen,
      tags: [...tags],
      ...(tip.trim() === '' ? {} : { tip: tip.trim() }),
    });
    if (result.kind === 'applied' || result.kind === 'queued') {
      feedback.emit('success');
      setSaved(true);
      return;
    }
    feedback.emit('error');
    toast.show({
      id: 'drivers-rate',
      title:
        result.kind === 'rejected' && result.code === 'NOT_ELIGIBLE'
          ? t({
              id: 'drivers.rate.notEligible',
              message: 'Rating opens after the trip, for members with a verified phone.',
            })
          : t({ id: 'drivers.rate.failed', message: "Couldn't save your answer. Try again." }),
    });
  }

  const props: RateDriverViewProps = {
    name: driver.name,
    days: driver.day_numbers,
    detail: null,
    verdict: chosen,
    tags: tags,
    tip: tip,
    saving: rate.pending,
    saved: saved,
    onBack: () => goBackOr(parent),
    onVerdict: (next) => {
      setVerdict(next);
      setSaved(false);
    },
    onToggleTag: (tag) => {
      setTags((current) =>
        current.includes(tag) ? current.filter((x) => x !== tag) : [...current, tag],
      );
      setSaved(false);
    },
    onTip: (text) => {
      setTip(text);
      setSaved(false);
    },
    onSave: () => void onSave(),
    onInvite:
      driver.listing_status === null
        ? () => router.push(driverRoutes.invite(tripId, providerId))
        : null,
  };
  return { kind: 'ready', props } as const;
}
