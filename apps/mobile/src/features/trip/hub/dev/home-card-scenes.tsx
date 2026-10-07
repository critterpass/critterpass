/**
 * Lab scenes for Home's card after a trip, on Home's gutter: a two-word Vietnamese place with
 * stacked marks, the longest city name, and a short one. The words come from the catalog, so a
 * capture in Vietnamese shows "NHÌN LẠI …".
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { HomeTripInput } from '@cp/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PostTripCard } from '@/features/home';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingTop: th.space['20'] },
}));

function trip(destinationName: string, guideId: string): HomeTripInput {
  return {
    id: 'trip-1',
    status: 'post_trip',
    startDate: '2026-10-02',
    endDate: '2026-10-04',
    tz: 'Asia/Ho_Chi_Minh',
    destinationId: 'place-1',
    destinationName,
    guideId,
    planProgress: 100,
    countdownTargetAt: null,
  };
}

function Scene({ place, guide }: { readonly place: string; readonly guide: string }) {
  const styles = useStyles();
  return (
    <Scaffold variant="dark" edges={['top']} testID="home-post-trip-scene">
      <View style={styles.body}>
        <PostTripCard trip={trip(place, guide)} />
      </View>
    </Scaffold>
  );
}

export const HOME_CARD_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'home-post-trip-da-nang': () => <Scene place="Đà Nẵng" guide="chava" />,
  'home-post-trip-long-name': () => <Scene place="Thành phố Hồ Chí Minh" guide="tokek" />,
  'home-post-trip-short-name': () => <Scene place="Bali" guide="tokek" />,
};
