/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { registerFixture } from '../gallery/registry';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';
import { Burst } from './Burst';
import { Flip } from './Flip';
import { Fold } from './Fold';

const useStyles = makeStyles((t) => ({
  stage: { height: 160, borderRadius: t.radius.lg, overflow: 'hidden' },
  face: {
    height: 160,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
    justifyContent: 'flex-end',
    backgroundColor: t.semantic.bg.control,
  },
  back: { backgroundColor: t.semantic.action.primary },
}));

function BurstDemo() {
  const styles = useStyles();
  const [run, setRun] = useState(0);
  return (
    <Pressable accessibilityRole="button" onPress={() => setRun((value) => value + 1)}>
      <View style={styles.stage}>
        <Burst key={run}>
          <View style={styles.face}>
            <Text variant="displayXl">Befriended!</Text>
          </View>
        </Burst>
      </View>
    </Pressable>
  );
}

function FoldDemo() {
  const styles = useStyles();
  const [run, setRun] = useState(0);
  return (
    <Pressable accessibilityRole="button" onPress={() => setRun((value) => value + 1)}>
      <View style={styles.stage}>
        <Fold key={run}>
          <View style={styles.face}>
            <Text variant="h3">Pon&apos;s draft is ready</Text>
          </View>
        </Fold>
      </View>
    </Pressable>
  );
}

function FlipDemo() {
  const styles = useStyles();
  const [flipped, setFlipped] = useState(false);
  return (
    <Pressable accessibilityRole="button" onPress={() => setFlipped((value) => !value)}>
      <Flip
        flipped={flipped}
        front={
          <View style={styles.face}>
            <Text variant="h3">Postcard front</Text>
          </View>
        }
        back={
          <View style={[styles.face, styles.back]}>
            <Text variant="voice">Wish you were here!</Text>
          </View>
        }
      />
    </Pressable>
  );
}

registerFixture('Burst', 'tap to replay', () => <BurstDemo />);
registerFixture('Fold', 'tap to replay', () => <FoldDemo />);
registerFixture('Flip', 'tap to flip', () => <FlipDemo />);
