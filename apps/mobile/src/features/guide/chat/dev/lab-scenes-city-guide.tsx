/**
 * Guide lab scenes for a city's own guide: Ngựa of Đà Lạt, a critter drawn from the dex's parts
 * (a pale fill, no limb poses). Its poses at the sizes the app uses, the guide sheet's conversation,
 * thinking and the empty thread, an empty state and a guide line, over fixed Đà Lạt fixtures with
 * every handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import type { Pose } from '@cp/critter-art';

import { guideSticker } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine } from '@/ui/people/GuideLine';
import { EmptyState } from '@/ui/states/EmptyState';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';

import type { GuideTripContext } from '../data/use-guide-context';
import { LAB_TRIP, LabSheet, answer, live, question } from './lab-scenes-chat';

const SLUG = 'ngua';
const POSES: readonly Pose[] = ['idle', 'wave', 'cheer', 'think', 'point', 'sleep'];
const SIZES: readonly number[] = [24, 32, 44, 60, 96];

const DA_LAT: GuideTripContext = {
  ...LAB_TRIP,
  destination: 'Đà Lạt',
  startDate: '2026-10-22',
  endDate: '2026-10-25',
};

const QUESTION = 'Is the night market worth it in the rain?';
const ANSWER =
  'From what I know so far it runs under awnings until late, so yes. I have not checked the stalls myself yet.';

/** Every pose at every size, one row per pose, then the guide in an empty state and two lines. */
function CityGuideStates(): ReactNode {
  const guide = guideSticker(SLUG);
  return (
    <Scaffold>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 64 }}
        testID="city-guide-states"
      >
        <Stack gap="16">
          {POSES.map((pose) => (
            <Row key={pose} gap="12" align="center">
              <View style={{ width: 48 }}>
                <Text variant="caption">{pose}</Text>
              </View>
              {SIZES.map((size) => (
                <Sticker
                  key={size}
                  kind={guide.kind}
                  name={guide.name}
                  seed={guide.seed}
                  size={size}
                  pose={pose}
                />
              ))}
            </Row>
          ))}
          <EmptyState
            guide={SLUG}
            guideName={guide.name}
            sticker={
              <Sticker
                kind={guide.kind}
                name={guide.name}
                seed={guide.seed}
                pose="sleep"
                size={96}
              />
            }
            title="Nothing here yet"
            line="Want me to find a pine-forest morning for the crew?"
          />
          <Card tone="raised">
            <GuideLine
              guide={SLUG}
              name={guide.name}
              line="I'm still learning Đà Lạt. Nobody has checked my picks here yet."
              bubble
            />
          </Card>
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}

const SAVED = [question('q1', QUESTION), answer('a1', ANSWER)];
const sheetGuide = () => {
  const guide = guideSticker(SLUG);
  return { slug: guide.id, name: guide.name };
};

export const CITY_GUIDE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'city-guide-states': () => <CityGuideStates />,
  'city-guide-chat': () => (
    <LabSheet guide={sheetGuide()} trip={DA_LAT} messages={SAVED} quick={false} />
  ),
  'city-guide-thinking': () => (
    <LabSheet guide={sheetGuide()} trip={DA_LAT} live={live({ phase: 'thinking' }, QUESTION)} />
  ),
  'city-guide-empty': () => (
    <LabSheet guide={sheetGuide()} trip={DA_LAT} mode="private" quick={false} />
  ),
};
