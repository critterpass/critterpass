/**
 * GO for one place: the preview over live data, Start into the chosen maps app with directions in
 * the selected mode, and Ride into Grab with the drop-off filled in. No turn-by-turn here: the maps
 * app speaks the directions.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Linking, Platform, View } from 'react-native';

import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { GoTarget } from './data/go-place';
import { GoPreviewView } from './go-preview-view';
import { mapsAppFor, mapsDirectionsUrl, useChosenMapsApp } from './maps-handoff';
import type { GrabRow } from './preview-model';
import { useGoPreview } from './use-go-preview';

const PLATFORM = Platform.OS === 'ios' ? 'ios' : 'android';

export function openGrab(grab: GrabRow): void {
  // Grab's own fare comes with its own link; the rest open the app, else its web page.
  if (grab.kind === 'fare') {
    void Linking.openURL(grab.url).catch(() => undefined);
    return;
  }
  void Linking.openURL(grab.url).catch(() =>
    Linking.openURL(grab.fallbackUrl).catch(() => undefined),
  );
}

function Missing({ loading }: { readonly loading: boolean }) {
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <Scaffold variant="dark" testID={loading ? 'go-loading' : 'go-missing'}>
      <View style={{ padding: theme.size.gutter, gap: theme.space['20'] }}>
        <BackEyebrow label={t({ id: 'go.preview.back', message: 'Back' })} testID="go-back" />
        {loading ? (
          <Skeleton preset="card" repeat={2} />
        ) : (
          <Text variant="bodyLg">
            {t({
              id: 'go.preview.missing',
              message: 'This place isn’t on your phone yet. Try again once it has synced.',
            })}
          </Text>
        )}
      </View>
    </Scaffold>
  );
}

export function GoScreen({ target }: { readonly target: GoTarget | null }) {
  const data = useGoPreview(target);
  const [chosen] = useChosenMapsApp();
  const app = mapsAppFor(PLATFORM, chosen);
  const { place, state, mode } = data;
  // A leave-by GO can't place opens what its push opened before GO: the day.
  const fallback = target?.kind === 'next_leave_by' ? target.fallback : null;
  const leave = place === null && fallback !== null;
  useEffect(() => {
    if (leave && fallback !== null) router.replace(fallback);
  }, [leave, fallback]);
  if (!place) return <Missing loading={place === undefined || leave} />;
  return (
    <GoPreviewView
      place={place}
      destinationSlug={place.destinationSlug}
      state={state}
      mode={mode}
      onMode={data.setMode}
      mapsApp={app}
      onStart={() => void Linking.openURL(mapsDirectionsUrl(place, mode, app)).catch(() => false)}
      onRetry={data.retryLocate}
      onRide={() => {
        if (state.grab !== null) openGrab(state.grab);
      }}
    />
  );
}
