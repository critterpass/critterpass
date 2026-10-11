/**
 * The free first trip ending (9.21), opened from the three-days-left push or the recap: boost the
 * trip for the crew, take Pass+ alone, or stay free (a quiet no for this trip).
 */
import { useLocalSearchParams } from 'expo-router';

import { ScreenLoading } from '@/ui/states/ScreenLoading';

import { MONETIZE_ROUTES } from '../routes';
import { useFtfEndingCopy } from './ftf-ending-copy';
import { FtfEndingView } from './ftf-ending-view';
import { useFtfEnding } from './use-ftf-ending';
import { useFtfEndingActions } from './use-ftf-ending-actions';

export function FtfEndingScreen() {
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId = typeof params.tripId === 'string' ? params.tripId : '';
  const { loaded, ending } = useFtfEnding(tripId);
  const actions = useFtfEndingActions(tripId);
  const copy = useFtfEndingCopy();
  if (!loaded) {
    return (
      <ScreenLoading
        backLabel={copy.title}
        fallback={MONETIZE_ROUTES.plan}
        testID="ftf-ending-loading"
      />
    );
  }
  return <FtfEndingView ending={ending} {...actions} />;
}
