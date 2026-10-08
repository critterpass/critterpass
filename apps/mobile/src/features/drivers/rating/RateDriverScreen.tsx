/**
 * The rate card (6g-1) for one of the trip's drivers. The answer may wait in the offline queue; the
 * server takes it once the trip has ended and the member's phone is verified.
 */
import type { DriverTag, DriverVerdict } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';
import { feedback, toast } from '@/motion';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import { LoadFailedScreen } from '../shared/load-failed';

import { rateDriverCommand } from '../ours/commands';
import { driverRoutes } from '../ours/routes';
import { useOurDrivers } from '../ours/use-our-drivers';
import { RateDriverView } from './RateDriverView';

export function RateDriverScreen({
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
    return offline || failed ? (
      <LoadFailedScreen
        backLabel={backLabel}
        fallback={parent}
        offline={offline}
        onRetry={reload}
        testID="drivers-rate-failed"
      />
    ) : (
      <ScreenLoading backLabel={backLabel} fallback={parent} testID="drivers-rate-loading" />
    );
  }
  if (driver === undefined) {
    return (
      <ScreenMissing
        backLabel={backLabel}
        fallback={parent}
        title={t({ id: 'drivers.rate.missingTitle', message: 'Not one of this trip’s drivers' })}
        line={t({
          id: 'drivers.rate.missingLine',
          message: 'You can rate the drivers this crew rode with on this trip.',
        })}
        testID="drivers-rate-missing"
      />
    );
  }

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

  return (
    <RateDriverView
      name={driver.name}
      days={driver.day_numbers}
      detail={null}
      verdict={chosen}
      tags={tags}
      tip={tip}
      saving={rate.pending}
      saved={saved}
      onBack={() => goBackOr(parent)}
      onVerdict={(next) => {
        setVerdict(next);
        setSaved(false);
      }}
      onToggleTag={(tag) => {
        setTags((current) =>
          current.includes(tag) ? current.filter((x) => x !== tag) : [...current, tag],
        );
        setSaved(false);
      }}
      onTip={(text) => {
        setTip(text);
        setSaved(false);
      }}
      onSave={() => void onSave()}
      onInvite={
        driver.listing_status === null
          ? () => router.push(driverRoutes.invite(tripId, providerId))
          : null
      }
    />
  );
}
