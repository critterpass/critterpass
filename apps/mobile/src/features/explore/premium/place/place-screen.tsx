/**
 * A place's page in the premium look once the place is known (from the phone or the api), and
 * the waiting, gone and failed states while it is not, each with its way back or a retry.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { goBackOr } from '@/lib/navigation/back';
import { Button, EmptyState, LoadingCritter, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { usePlaceRow } from '../../place-detail/remote-place';
import { useTripFacts } from '../../place-queries';
import type { PlaceScreenProps } from '../../screens/place-screen';
import { PlacePage } from './place-page';

const goBack = () => goBackOr();

export function PremiumPlaceScreen(props: PlaceScreenProps) {
  const theme = usePremiumTheme();
  const trip = props.tripId ?? null;
  const facts = useTripFacts(trip, props.placeId);
  const place = usePlaceRow(props.placeId, props.destinationId ?? facts.destinationId);
  if (place.kind === 'ready') {
    return (
      <PlacePage
        placeId={props.placeId}
        row={place.row}
        profile={place.profile}
        tripId={trip}
        onBack={goBack}
      />
    );
  }
  const back = t({ id: 'explore.place.goBack', message: 'Go back' });
  return (
    <PushScreen title="" backLabel={back} testID="place-detail-unavailable">
      <View style={{ paddingTop: theme.space.gap16 * 4, paddingHorizontal: theme.space.gutter }}>
        {place.kind === 'waiting' ? (
          <LoadingCritter
            label={t({ id: 'explore.place.loading', message: 'Finding the place' })}
          />
        ) : place.kind === 'missing' ? (
          <EmptyState
            title={t({
              id: 'explore.place.goneTitle',
              message: "This place isn't listed any more",
            })}
            line={t({
              id: 'explore.place.goneLine',
              message: 'It may have closed or been merged with another. Search for it by name.',
            })}
            check={false}
            action={<Button label={back} variant="secondary" onPress={goBack} />}
          />
        ) : (
          <EmptyState
            title={t({ id: 'explore.place.failedTitle', message: "This place didn't load" })}
            line={
              place.offline
                ? t({
                    id: 'explore.place.missingOffline',
                    message: "I need a connection the first time. After that it's here offline.",
                  })
                : t({
                    id: 'explore.place.failedLine',
                    message: 'Something went wrong on our side. Try again.',
                  })
            }
            check={false}
            action={
              <Button
                label={t({ id: 'explore.place.retry', message: 'Retry' })}
                onPress={place.retry}
              />
            }
          />
        )}
      </View>
    </PushScreen>
  );
}
