/* eslint-disable lingui/no-unlocalized-strings -- the dev kit gallery's sample labels, never shipped copy. */
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Button } from '../buttons/Button';
import { IconButton } from '../buttons/IconButton';
import { Card } from '../cards/Card';
import { CrossFade } from '../motion/CrossFade';
import { NumberRoll } from '../motion/NumberRoll';
import { StampMoment } from '../motion/StampMoment';
import { SwipeDeck } from '../motion/SwipeDeck';
import type { SwipeDeckHandle } from '../motion/SwipeDeck';
import type { SwipeVote } from '../motion/swipe-verdict';
import { RectStamp, RoundStamp } from '../stickers/Stamp';
import { Text } from '../text/Text';
import { makePremiumStyles, usePremiumTheme } from '../theme/PremiumThemeProvider';
import { GalleryRow, GallerySection } from './gallery-section';

const IDEAS = ['Monkey forest', 'Tegallalang terraces', 'Uluwatu sunset', 'Nusa Penida boat'];

export function MotionSamples() {
  const styles = useStyles();
  const t = usePremiumTheme();
  const [amount, setAmount] = useState(1092.1);
  const [swapped, setSwapped] = useState(false);
  const [landed, setLanded] = useState(false);
  const [votes, setVotes] = useState<readonly string[]>([]);
  const [deckKey, setDeckKey] = useState(0);
  const deck = useRef<SwipeDeckHandle>(null);

  const onVote = (idea: string, vote: SwipeVote) => setVotes((v) => [...v, `${idea}: ${vote}`]);

  return (
    <GallerySection title="Motion">
      <GalleryRow>
        <NumberRoll text={`$${amount.toFixed(2)}`} />
        <Button
          label="Add $48.50"
          size="small"
          variant="floating"
          onPress={() => setAmount((a) => a + 48.5)}
        />
      </GalleryRow>
      <GalleryRow>
        <CrossFade swapKey={swapped ? 'b' : 'a'}>
          <Text variant="rowTitle">{swapped ? 'Leave by 8:10' : 'Leave by 7:45'}</Text>
        </CrossFade>
        <Button
          label="Swap"
          size="small"
          variant="floating"
          onPress={() => setSwapped((s) => !s)}
        />
      </GalleryRow>
      <View style={styles.stage}>
        <StampMoment
          landed={landed}
          stamp={
            <RoundStamp word="BALI" top="CRITTERPASS" bottom="12 OCT 2026" size={180} rotate={0} />
          }
          result={
            <Card padded>
              <Text variant="rowTitle">Bali is stamped in your pass</Text>
            </Card>
          }
        >
          <View style={[styles.page, { backgroundColor: t.accent.paper }]} />
        </StampMoment>
      </View>
      <Button
        label={landed ? 'Lift the stamp' : 'Drop the stamp'}
        size="medium"
        variant="control"
        onPress={() => setLanded((l) => !l)}
      />
      <View style={styles.stage}>
        <SwipeDeck
          key={deckKey}
          ref={deck}
          items={IDEAS}
          keyOf={(idea) => idea}
          inStamp={<RectStamp word="I'M IN" ink="green" rotate={0} />}
          onVote={onVote}
          renderCard={(idea) => (
            <Card padded style={styles.card}>
              <Text variant="title">{idea}</Text>
            </Card>
          )}
        />
      </View>
      <GalleryRow>
        <IconButton icon="close" label="Not for me" onPress={() => deck.current?.vote('out')} />
        <IconButton
          icon="check"
          label="I'm in"
          tone="ink"
          onPress={() => deck.current?.vote('in')}
        />
        <Button
          label="Deal again"
          size="small"
          variant="floating"
          onPress={() => {
            setVotes([]);
            setDeckKey((k) => k + 1);
          }}
        />
      </GalleryRow>
      <Text variant="captionMuted">{votes.join(' · ') || 'No votes yet'}</Text>
    </GallerySection>
  );
}

const useStyles = makePremiumStyles((t) => ({
  stage: { height: 360, borderRadius: t.radius.card, overflow: 'hidden' },
  page: { flex: 1 },
  card: { flex: 1, justifyContent: 'flex-end' },
}));
