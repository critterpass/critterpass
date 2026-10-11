/**
 * Befriended (8.04): sun rays turning behind the critter, a confetti burst, the form chip, the
 * sticker hopping, the BEFRIENDED! stamp landing on the Lively spring with its XP tag, the name,
 * who in the crew has it, and the guide's note. ADD TO YOUR PASS lands it on the pass; SHARE WITH
 * THE CREW opens the crew chat; ✕ adds it too (nothing is lost by leaving).
 */
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CrewStack, RectStamp, Tag, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { artKind } from '../../art-kind';
import {
  addToPass,
  befriendedTitle,
  noticed,
  shareWithCrew,
  xpChip,
} from '../../encounter/encounter-copy';
import type { SpawnArt } from '../../encounter/encounter-model';
import { Confetti, Rays } from '../components/celebration';
import { FormArt } from '../components/form-art';
import { Hop, Land } from '../components/loops';
import { premiumMemberColour } from '../components/member-colour';
import { SUN_RAYS } from '../components/scrims';

const STICKER = 220;

export interface BefriendedSceneProps {
  readonly art: SpawnArt;
  readonly eyebrow: string;
  readonly crew: readonly string[];
  readonly crewLine: string | null;
  readonly minutes: number;
  readonly onAdd: () => void;
  readonly onClose: () => void;
  readonly onShare: (() => void) | null;
}

export function BefriendedScene(props: BefriendedSceneProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { art } = props;
  const name = art.name ?? '';
  return (
    <FullScreen
      closeLabel={addToPass()}
      overPhoto={false}
      onClose={props.onClose}
      testID="critters-encounter-befriended"
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.color.ground }]}>
        <Rays color={SUN_RAYS} ms={24_000} centerY={insets.top + 200} />
        <Confetti count={46} fx={0.5} fy={0.32} />
      </View>
      <View style={[styles.column, { paddingTop: insets.top + 16 }]}>
        <View
          style={[
            styles.chip,
            { backgroundColor: theme.color.card, boxShadow: theme.shadow.float },
          ]}
        >
          <Text variant="label">{props.eyebrow}</Text>
        </View>
        <Hop style={styles.sticker}>
          <FormArt
            kind={artKind(art.key)}
            name={name}
            size={STICKER}
            form={art.form}
            pose="cheer"
            seed={art.seed}
          />
        </Hop>
        <Land delayMs={350} style={styles.stamp}>
          <RectStamp word={befriendedTitle()} ink="pink" rotate={-5} />
          {art.xp > 0 ? (
            <View style={styles.xp}>
              <Tag label={xpChip(art.xp)} rotate={8} />
            </View>
          ) : null}
        </Land>
        <Text variant="largeTitle" align="center" style={styles.name} accessibilityRole="header">
          {name}
        </Text>
        {props.crewLine === null ? null : (
          <View style={styles.crew}>
            <CrewStack
              members={props.crew.map((member) => ({
                id: member,
                name: member,
                color: premiumMemberColour(member),
              }))}
              size={26}
              accessibilityLabel={props.crew.join(', ')}
            />
            <Text variant="caption" tone="muted">
              {props.crewLine}
            </Text>
          </View>
        )}
        <Text
          variant="guide"
          color={theme.color.status.booked.text}
          align="center"
          style={styles.note}
        >
          {noticed(props.minutes)}
        </Text>
      </View>
      <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
        <Button label={addToPass()} onPress={props.onAdd} testID="critters-encounter-add" />
        {props.onShare === null ? null : (
          <TextButton
            label={shareWithCrew()}
            onPress={props.onShare}
            testID="critters-encounter-share"
          />
        )}
      </View>
    </FullScreen>
  );
}

const styles = StyleSheet.create({
  column: { alignItems: 'center', paddingHorizontal: 24 },
  chip: { height: 30, borderRadius: 15, paddingHorizontal: 12, justifyContent: 'center' },
  sticker: { marginTop: 18, width: STICKER, height: STICKER },
  stamp: { marginTop: 4, alignItems: 'center' },
  xp: { position: 'absolute', right: -26, top: -22 },
  name: { marginTop: 36 },
  crew: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  note: { marginTop: 14 },
  actions: { position: 'absolute', left: 20, right: 20, bottom: 0, gap: 8, alignItems: 'stretch' },
});
