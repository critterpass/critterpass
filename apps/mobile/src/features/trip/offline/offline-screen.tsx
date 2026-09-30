/**
 * The offline card (3k-4) as its own page: the same card and lists the hub shows with no signal,
 * and, with signal, what this phone has ready for when it goes.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextLink } from '@/ui/buttons/TextLink';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { useTheme } from '@/ui/theme';

import { offlineStorageRoute } from '../hub/routes';
import { OfflineView, type OfflineViewProps } from './offline-view';
import { useOffline } from './use-offline';

export function OfflinePage({
  view,
  footer,
}: {
  readonly view: OfflineViewProps | null;
  readonly footer?: ReactNode;
}) {
  const { t } = useLingui();
  const back = <BackEyebrow label={t({ id: 'trip.offline.backToTrip', message: 'Trip' })} />;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Scaffold variant="dark" edges={['top']} testID="trip-offline-page">
      <ScrollView
        contentContainerStyle={{
          padding: theme.size.gutter,
          paddingBottom: insets.bottom + theme.space['24'],
        }}
      >
        {back}
        {view === null ? null : <OfflineView {...view} />}
        {footer}
      </ScrollView>
    </Scaffold>
  );
}

export function OfflineScreen({ tripId }: { readonly tripId: string }) {
  const { t } = useLingui();
  return (
    <OfflinePage
      view={useOffline(tripId, { always: true })}
      footer={
        <TextLink
          label={t({ id: 'trip.offline.storageLink', message: 'Trips saved on this phone' })}
          onPress={() => router.push(offlineStorageRoute())}
          testID="trip-offline-storage-link"
        />
      }
    />
  );
}
