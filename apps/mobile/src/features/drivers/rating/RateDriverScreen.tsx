/**
 * The rate card (6g-1) for one of the trip's drivers; its state and save are `useRateDriver`.
 */
import { useLingui } from '@lingui/react/macro';

import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import { LoadFailedScreen } from '../shared/load-failed';
import { RateDriverView } from './RateDriverView';
import { useRateDriver } from './use-rate-driver';

export function RateDriverScreen(props: { readonly tripId: string; readonly providerId: string }) {
  const { t } = useLingui();
  const rate = useRateDriver(props);
  if (rate.kind === 'failed') {
    return (
      <LoadFailedScreen
        backLabel={rate.backLabel}
        fallback={rate.parent}
        offline={rate.offline}
        onRetry={rate.reload}
        testID="drivers-rate-failed"
      />
    );
  }
  if (rate.kind === 'loading') {
    return (
      <ScreenLoading
        backLabel={rate.backLabel}
        fallback={rate.parent}
        testID="drivers-rate-loading"
      />
    );
  }
  if (rate.kind === 'missing') {
    return (
      <ScreenMissing
        backLabel={rate.backLabel}
        fallback={rate.parent}
        title={t({ id: 'drivers.rate.missingTitle', message: 'Not one of this trip’s drivers' })}
        line={t({
          id: 'drivers.rate.missingLine',
          message: 'You can rate the drivers this crew rode with on this trip.',
        })}
        testID="drivers-rate-missing"
      />
    );
  }
  return <RateDriverView {...rate.props} />;
}
