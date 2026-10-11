/**
 * The forecast screen (3k-7): its data is `useForecastScreen`.
 */
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import { TRIPS_TAB } from '../../hub/routes';
import { ForecastView } from './forecast-view';
import { useForecastScreen } from './use-forecast-screen';

export function ForecastScreen({ tripId }: { readonly tripId: string }) {
  const forecast = useForecastScreen(tripId);
  if (forecast.missing) {
    return (
      <ScreenMissing backLabel={forecast.back} fallback={TRIPS_TAB} testID="forecast-missing" />
    );
  }
  return <ForecastView {...forecast.props} />;
}
