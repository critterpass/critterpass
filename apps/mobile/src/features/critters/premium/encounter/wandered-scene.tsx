/**
 * It wandered off (8.06): the scene fading to the ground, a ghost of the critter walking away, the
 * tier tag, a gentle line, and the best chance to meet it again from the crowd forecast (fourteen
 * bars, the quietest lit). REMIND ME sets a local reminder; BACK TO THE DAY leaves. The ✕ sits
 * top-left like every full screen.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Tag, Text, TextButton, tierWord, usePremiumTheme } from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { artKind } from '../../art-kind';
import {
  backToDay,
  bestChance,
  encounterOver,
  noForecast,
  remindAt,
  stayedFor,
  wanderedBody,
  wanderedTitle,
} from '../../encounter/encounter-copy';
import type { SpawnArt } from '../../encounter/encounter-model';
import { CritterSilhouette } from '../components/critter-silhouette';
import { Float } from '../components/loops';
import { CLEAR_GLASS, ON_PHOTO, ON_PHOTO_MUTED, SCRIM, WASHED_PHOTO } from '../components/scrims';
import { tierAccent } from '../components/tier';
import { EncounterGround } from './live-scene';

export interface ForecastView {
  readonly when: string;
  readonly remind: string;
  readonly bars: readonly number[];
  readonly litIndex: number;
  readonly hours: readonly [string, string, string] | readonly string[];
}

export interface WanderedSceneProps {
  readonly art: SpawnArt;
  readonly place: string;
  readonly habitat: string;
  readonly minutes: number;
  readonly forecast: ForecastView | null;
  readonly onRemind: () => void;
  readonly onClose: () => void;
}

const BAR_BOX = 46;

export function WanderedScene(props: WanderedSceneProps) {
  const { t } = useLingui();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { art } = props;
  const tier = tierWord(art.rarity);
  const fade = theme.scheme === 'dark' ? SCRIM.wanderedDark : SCRIM.wanderedLight;
  return (
    <FullScreen
      closeLabel={backToDay()}
      onClose={props.onClose}
      testID="critters-encounter-wandered_off"
    >
      <View style={[StyleSheet.absoluteFill, { filter: WASHED_PHOTO }]}>
        <EncounterGround dim={false} />
      </View>
      <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: fade }]} />
      <View style={[styles.chip, { top: insets.top + 6, backgroundColor: CLEAR_GLASS }]}>
        <Text variant="label" color={ON_PHOTO} numberOfLines={1}>
          {`${encounterOver()} · ${stayedFor(props.minutes)}`}
        </Text>
      </View>
      <View style={[styles.ghost, { top: insets.top + 110 }]} pointerEvents="none">
        <Float>
          <CritterSilhouette
            kind={artKind(art.key)}
            label={t({ id: 'critters.premium.encounter.ghost', message: 'It wandered off' })}
            size={110}
            seed={art.seed}
            ghost
            mirrored
          />
        </Float>
        <View style={styles.prints}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.print} />
          ))}
        </View>
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 8 }]}>
        <Tag
          label={props.habitat === '' ? `◆ ${tier}` : `◆ ${tier} · ${props.habitat}`}
          color={tierAccent(theme, art.rarity)}
          rotate={-3}
        />
        <Text variant="display" accessibilityRole="header" style={styles.title}>
          {wanderedTitle()}
        </Text>
        <Text variant="body" tone="inkSecondary" style={styles.body}>
          {wanderedBody(props.place, props.minutes)}
        </Text>
        <Card padded style={styles.chance} testID="critters-encounter-forecast">
          {props.forecast === null ? (
            <Text variant="caption" tone="muted">
              {noForecast()}
            </Text>
          ) : (
            <>
              <View style={styles.chanceHead}>
                <Text variant="caption" tone="muted">
                  {bestChance()}
                </Text>
                <Text variant="headline">{props.forecast.when}</Text>
              </View>
              <View style={styles.bars} accessible accessibilityLabel={props.forecast.when}>
                {props.forecast.bars.map((value, i) => (
                  <View
                    key={i}
                    style={[
                      styles.bar,
                      {
                        height: Math.max(4, value * BAR_BOX),
                        backgroundColor:
                          i === props.forecast?.litIndex
                            ? theme.accent.mint
                            : theme.color.fieldBorder,
                      },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.axis}>
                {props.forecast.hours.map((h) => (
                  <Text key={h} variant="captionMuted" tone="placeholder">
                    {h}
                  </Text>
                ))}
              </View>
            </>
          )}
        </Card>
        <View style={styles.actions}>
          {props.forecast === null ? null : (
            <Button
              label={remindAt(props.forecast.remind)}
              onPress={props.onRemind}
              testID="critters-encounter-remind"
            />
          )}
          <TextButton
            label={backToDay()}
            onPress={props.onClose}
            testID="critters-encounter-back"
          />
        </View>
      </View>
    </FullScreen>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    left: 76,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  ghost: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  prints: { flexDirection: 'row', gap: 14, marginTop: 6 },
  print: { width: 8, height: 5, borderRadius: 3, backgroundColor: ON_PHOTO_MUTED },
  bottom: { position: 'absolute', left: 20, right: 20, bottom: 0 },
  title: { marginTop: 12 },
  body: { marginTop: 8 },
  chance: { marginTop: 18 },
  chanceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: BAR_BOX, marginTop: 12 },
  bar: { flex: 1, borderRadius: 4 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  actions: { marginTop: 18, gap: 8, alignItems: 'stretch' },
});
