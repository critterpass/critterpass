import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RevealAction, RevealStage } from '@/features/vote/final/reveal-stage';
import { guideColour } from '@/features/vote/format';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { AvatarStack } from '@/ui/people/AvatarStack';

export const __CP_DEV_ROUTE__ = true;

/** The moments a capture holds the reveal's entrance at; the last one lets it play to the end. */
const MOMENTS = [
  { id: '600', holdAt: 600 },
  { id: '1000', holdAt: 1000 },
  { id: 'settled', holdAt: undefined },
] as const;

function voters(names: readonly string[], from: number) {
  return (
    <AvatarStack
      members={names.map((name, index) => ({ key: name, name, joinIndex: from + index }))}
      size="sm"
      max={8}
    />
  );
}

const ROWS = [
  {
    id: 'kyoto',
    name: 'KYOTO',
    votes: 4,
    winner: true,
    color: guideColour('pon'),
    voters: voters(['Maya', 'Jordan', 'Winston', 'Rin'], 0),
  },
  {
    id: 'lisbon',
    name: 'LISBON',
    votes: 2,
    winner: false,
    color: guideColour('sardi'),
    voters: voters(['Aiko', 'Dev'], 4),
  },
];

/**
 * The winner reveal (3c-2) held at a moment of its entrance, so a device capture shows the name
 * mid-fall (600 ms), landed with the score arriving (1000 ms) and the settled screen. A tap moves
 * to the next moment. A held moment shows the full entrance's frame whatever the motion setting.
 */
export default function RevealMomentsScreen() {
  const [index, setIndex] = useState(0);
  const moment = MOMENTS[index % MOMENTS.length] ?? MOMENTS[0];
  return (
    <View style={StyleSheet.absoluteFill} testID={`reveal-moment-${moment.id}`}>
      <RevealStage
        key={moment.id}
        colour={guideColour('pon')}
        photo={null}
        eyebrow="WHERE NEXT? · FINAL"
        voted="6 OF 6 VOTED"
        guide={GUIDE_STICKERS.pon}
        name="KYOTO"
        score="WINS 4–2"
        tallySummary="Kyoto wins 4–2; Kyoto, 4 votes; Lisbon, 2 votes"
        rows={ROWS}
        consolation={{
          guide: GUIDE_STICKERS.sardi,
          line: 'Sardi took it well. Already pitching the next trip.',
        }}
        action={<RevealAction label="SET UP KYOTO" onPress={() => undefined} />}
        backInDeck="Lisbon goes back in the deck for next time"
        holdAt={moment.holdAt}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next moment"
        style={StyleSheet.absoluteFill}
        onPress={() => setIndex((now) => now + 1)}
        testID="reveal-moment-next"
      />
    </View>
  );
}
