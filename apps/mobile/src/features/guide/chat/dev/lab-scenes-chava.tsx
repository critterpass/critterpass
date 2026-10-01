/**
 * Guide lab scenes for Chà Vá, the Đà Nẵng guide: every pose at every sticker size the app uses,
 * the guide sheet header and conversation, thinking, the empty thread, an empty state and a guide
 * line, over fixed Đà Nẵng fixtures with every handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { canonicalSeed, critters, type Pose } from '@cp/critter-art';

import { GUIDE_DEX_IDS, GUIDE_STICKERS } from '@/ui/avatar/guides';
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

const CHAVA = GUIDE_STICKERS.chava;
const GUIDE = { slug: CHAVA.id, name: CHAVA.name };
const DEX = critters.find((critter) => critter.id === GUIDE_DEX_IDS.chava);
const SEED = DEX === undefined ? 7 : canonicalSeed(DEX);

const POSES: readonly Pose[] = ['idle', 'wave', 'cheer', 'think', 'point', 'sleep'];
/** Chat avatars, list rows, the FAB and inline cards. */
const SMALL_SIZES: readonly number[] = [24, 32, 44, 60];

const DA_NANG: GuideTripContext = {
  ...LAB_TRIP,
  destination: 'Đà Nẵng',
  startDate: '2026-10-02',
  endDate: '2026-10-04',
};

const STORM_QUESTION = 'Clouds over Sơn Trà. Is the beach still on?';
const STORM_ANSWER =
  'Mỹ Khê is fine till two, then a squall rolls in. Swim early, then mì Quảng under a roof. Cảm ơn me later.';

function ChavaSticker({ pose, size }: { pose: Pose | 'blink'; size: number }) {
  return (
    <Sticker
      kind={CHAVA.kind}
      name={CHAVA.name}
      seed={SEED}
      size={size}
      {...(pose === 'blink' ? { closedEyes: true } : { pose })}
    />
  );
}

/** Every pose (and a blink) at the small sizes, one row per pose. */
function ChavaPosesSmall(): ReactNode {
  return (
    <Scaffold>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }} testID="chava-poses">
        <Stack gap="12">
          <Text variant="h2">{CHAVA.name}</Text>
          {[...POSES, 'blink' as const].map((pose) => (
            <Row key={pose} gap="12" align="center">
              <Text variant="label" style={{ width: 56 }}>
                {pose}
              </Text>
              {SMALL_SIZES.map((size) => (
                <ChavaSticker key={size} pose={pose} size={size} />
              ))}
            </Row>
          ))}
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}

/** Every pose at one of the large sizes (cards and empty states at 96, heroes at 150). */
function ChavaPosesAt({ size }: { size: number }): ReactNode {
  return (
    <Scaffold>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }} testID="chava-poses">
        <Row gap="12" wrap>
          {POSES.map((pose) => (
            <Stack key={pose} gap="4" align="center">
              <ChavaSticker pose={pose} size={size} />
              <Text variant="label">{pose}</Text>
            </Stack>
          ))}
        </Row>
      </ScrollView>
    </Scaffold>
  );
}

function ChavaStates(): ReactNode {
  return (
    <Scaffold>
      <View style={{ padding: 16, paddingTop: 64 }} testID="chava-states">
        <Stack gap="16">
          <EmptyState
            guide="chava"
            guideName={CHAVA.name}
            sticker={
              <Sticker kind={CHAVA.kind} name={CHAVA.name} seed={SEED} pose="sleep" size={96} />
            }
            title="Nothing here yet"
            line="Want me to find a beach day for the crew?"
          />
          <Card tone="red" halftone>
            <Row gap="12" align="center">
              <Sticker kind={CHAVA.kind} name={CHAVA.name} seed={SEED} pose="cheer" size={60} />
              <Text variant="h2">Đà Nẵng</Text>
            </Row>
          </Card>
          <Card tone="paper">
            <GuideLine
              guide="chava"
              name={CHAVA.name}
              line="Xin chào! Sơn Trà at sunrise, then bánh tráng cuốn thịt heo at chợ Hàn."
              sticker={
                <Sticker kind={CHAVA.kind} name={CHAVA.name} seed={SEED} pose="wave" size={44} />
              }
            />
          </Card>
          <Card tone="raised">
            <GuideLine
              guide="chava"
              name={CHAVA.name}
              line="October storms don’t knock. I’ll move the plan indoors if the bão comes."
              bubble
            />
          </Card>
        </Stack>
      </View>
    </Scaffold>
  );
}

const SAVED = [question('q1', STORM_QUESTION), answer('a1', STORM_ANSWER)];

export const CHAVA_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'chava-poses': () => <ChavaPosesSmall />,
  'chava-poses-96': () => <ChavaPosesAt size={96} />,
  'chava-poses-150': () => <ChavaPosesAt size={150} />,
  'chava-states': () => <ChavaStates />,
  'chava-chat': () => <LabSheet guide={GUIDE} trip={DA_NANG} messages={SAVED} quick={false} />,
  'chava-thinking': () => (
    <LabSheet guide={GUIDE} trip={DA_NANG} live={live({ phase: 'thinking' }, STORM_QUESTION)} />
  ),
  'chava-empty': () => <LabSheet guide={GUIDE} trip={DA_NANG} mode="private" quick={false} />,
};
