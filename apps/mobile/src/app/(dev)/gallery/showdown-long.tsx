import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PitchSections } from '@cp/domain';
import type { BoardPlace } from '@/features/vote/data/use-board';
import type { PollOptionView } from '@/features/vote/data/poll-view';
import { ShowdownHalf } from '@/features/vote/final/showdown-half';
import { useShowdownNames } from '@/features/vote/final/showdown-name-fit';
import { makeStyles, Text, useTheme } from '@/ui';

export const __CP_DEV_ROUTE__ = true;

const CHEF: BoardPlace = {
  id: 'p-chef',
  name: 'Chefchaouen',
  guide: 'tokek',
  colour: '#ff9a4d',
  coverage: 'guest',
};
const HCM: BoardPlace = {
  id: 'p-hcm',
  name: 'Thành phố Hồ Chí Minh',
  guide: 'tokek',
  colour: '#52d6a0',
  coverage: 'guest',
};

function option(place: BoardPlace, votes: number): PollOptionView {
  return {
    id: `o-${place.id}`,
    label: place.name,
    refId: place.id,
    pitchId: `pitch-${place.id}`,
    proposedBy: null,
    votes,
    voterIds: [],
    mine: false,
    winner: false,
  };
}

function sections(place: BoardPlace, quote: string): PitchSections {
  return {
    sticker: {
      place_id: place.id,
      name: place.name,
      country: null,
      coverage: 'guest',
      guide: 'tokek',
    },
    headline: null,
    chips: [
      { kind: 'flight', minutes: 16 * 60, origin: 'SIN' },
      { kind: 'price', amount_minor: 192_000, currency: 'USD', origin: 'SIN' },
      { kind: 'best_months', months: [4, 5, 10] },
    ],
    reasons: [],
    quote,
    alternatives: [],
  };
}

const SECTIONS = new Map<string, PitchSections>([
  ['pitch-p-chef', sections(CHEF, 'Blue lanes all the way up the hill. Bring good shoes.')],
  ['pitch-p-hcm', sections(HCM, 'Street food until two in the morning, every night.')],
]);

const useStyles = makeStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.semantic.bg.base },
  footer: {
    position: 'absolute',
    left: t.space['16'],
    right: t.space['16'],
    backgroundColor: t.semantic.bg.base,
    borderRadius: t.radius.lg,
    padding: t.space['14'],
    gap: t.space['4'],
  },
}));

/**
 * The destination showdown (3c-1) with two long names, so a device capture shows how a half sets
 * its name smaller before it scrolls: one long word against a many-word city.
 */
export default function ShowdownLongScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const names = useShowdownNames();
  const [footer, setFooter] = useState(0);
  const a = CHEF;
  const b = HCM;
  const footerBottom = insets.bottom + theme.space['8'];
  return (
    <View style={styles.screen} testID="showdown-long">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        bounces={false}
        onLayout={(event) => names.onViewport(event.nativeEvent.layout.height)}
      >
        <ShowdownHalf
          option={option(a, 2)}
          place={a}
          people={new Map()}
          sectionsOf={SECTIONS}
          alignEnd={false}
          onVote={undefined}
          squashKey={0}
          edgeInset={insets.top + theme.space['32']}
          {...names.first}
        />
        <ShowdownHalf
          option={option(b, 2)}
          place={b}
          people={new Map()}
          sectionsOf={SECTIONS}
          alignEnd
          onVote={undefined}
          squashKey={0}
          edgeInset={footerBottom + footer + theme.space['16']}
          {...names.second}
        />
      </ScrollView>
      <View
        style={[styles.footer, { bottom: footerBottom }]}
        onLayout={(event) => setFooter(event.nativeEvent.layout.height)}
      >
        <Text variant="label" color={theme.semantic.action.primary}>
          4 VOTES · 1 TO GO
        </Text>
        <Text variant="bodySm">A tie goes to Chefchaouen.</Text>
      </View>
    </View>
  );
}
