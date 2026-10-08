/**
 * The two ends of an encounter. Wandered off (3l-5): the next quiet window from the place's crowd
 * forecast with REMIND ME instead of a retry (a plain line when there's no forecast). Befriended
 * (3l-6): rays turn behind the sticker as it slaps down, the XP chip counts up, and ADD TO YOUR
 * PASS carries it to the pass.
 */
import { upper } from '@cp/i18n';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { useTweenedNumber } from '@/ui/data/CountUp';
import { TextLink } from '@/ui/buttons/TextLink';
import { Tag } from '@/ui/plan/ActionPill';
import { EncounterCard } from '@/ui/critters/EncounterCard';
import type { Tier } from '@/ui/critters/tier';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { artKind } from '../art-kind';
import { BefriendRays } from './befriend-rays';
import type { SpawnArt } from './encounter-model';
import {
  addToPass,
  backToDay,
  befriendedTitle,
  bestChance,
  noForecast,
  noticed,
  remindAt,
  shareWithCrew,
  wanderedBody,
  wanderedTitle,
  xpChip,
} from './encounter-copy';

const useStyles = makeStyles((th) => ({
  forecast: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['10'],
    alignSelf: 'stretch',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: th.space['4'],
    height: th.space['32'],
  },
  bar: { flex: 1, borderRadius: th.space['2'] },
}));

export interface ForecastView {
  readonly when: string;
  readonly remind: string;
  readonly bars: readonly number[];
  readonly litIndex: number;
  readonly hours: readonly [string, string, string];
}

export function WanderedCard(props: {
  readonly tier: Tier;
  readonly habitat: string;
  readonly place: string;
  readonly minutes: number;
  readonly forecast: ForecastView | null;
  readonly onRemind: () => void;
  readonly onBack: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const f = props.forecast;
  return (
    <EncounterCard
      tier={props.tier}
      habitat={upper(props.habitat, locale)}
      title={upper(wanderedTitle(), locale)}
      body={wanderedBody(props.place, props.minutes)}
      action={
        <Stack gap="12" align="center" style={{ alignSelf: 'stretch' }}>
          {f === null ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {noForecast()}
            </Text>
          ) : (
            <View style={styles.forecast} testID="critters-wandered-forecast">
              <Row justify="space-between" align="baseline">
                <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                  {upper(bestChance(), locale)}
                </Text>
                <Text variant="title">{upper(f.when, locale)}</Text>
              </Row>
              <View style={styles.bars} accessibilityElementsHidden>
                {f.bars.map((level, i) => (
                  <View
                    key={i}
                    style={[
                      styles.bar,
                      {
                        height: `${Math.max(15, Math.min(100, level))}%`,
                        backgroundColor:
                          i === f.litIndex ? theme.semantic.state.success : theme.color.ink['700'],
                      },
                    ]}
                  />
                ))}
              </View>
              <Row justify="space-between">
                {f.hours.map((hour) => (
                  <Text key={hour} variant="caption" color={theme.semantic.text.secondary}>
                    {hour}
                  </Text>
                ))}
              </Row>
            </View>
          )}
          {f === null ? null : (
            <PillButton
              label={remindAt(f.remind)}
              onPress={props.onRemind}
              block
              testID="critters-wandered-remind"
            />
          )}
          <TextLink label={backToDay()} onPress={props.onBack} testID="critters-wandered-back" />
        </Stack>
      }
      testID="critters-wandered"
    />
  );
}

/** Counts up from zero with the app's shared number tween (numbers never jump). */
function XpChip({ xp }: { readonly xp: number }) {
  const theme = useTheme();
  const shown = useTweenedNumber(xp);
  return (
    <Tag
      label={xpChip(Math.round(shown))}
      color={theme.color.yellow}
      textColor={theme.semantic.text.onAccent}
    />
  );
}

export function BefriendedView(props: {
  readonly art: SpawnArt;
  readonly eyebrow: string;
  /** The found form's name, when the viewer may see it. */
  readonly formChip: string | null;
  /** "2 in the crew", when crewmates' finds of it were heard. */
  readonly crewChip: string | null;
  readonly minutes: number;
  readonly onAdd: () => void;
  readonly onShare: (() => void) | null;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const { art } = props;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="critters-befriended">
      <View style={{ flex: 1, justifyContent: 'space-between', padding: theme.size.gutter }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <BefriendRays />
          <Sticker
            kind={artKind(art.key)}
            name={art.name ?? ''}
            size={220}
            seed={art.seed}
            {...(art.form === null ? {} : { form: art.form })}
          />
        </View>
        <Stack gap="10" align="center">
          <Text variant="eyebrow" color={theme.tier[art.rarity].color}>
            {upper(props.eyebrow, locale)}
          </Text>
          <Text variant="displayXl" testID="critters-befriended-title">
            {upper(befriendedTitle(), locale)}
          </Text>
          <Row gap="6" wrap justify="center">
            {art.xp > 0 ? <XpChip xp={art.xp} /> : null}
            {props.formChip === null ? null : (
              <Tag
                label={upper(props.formChip, locale)}
                color={theme.color.green.base}
                textColor={theme.semantic.text.onAccent}
              />
            )}
            {props.crewChip === null ? null : (
              <Tag
                label={upper(props.crewChip, locale)}
                color={theme.color.ink['700']}
                textColor={theme.semantic.text.primary}
              />
            )}
          </Row>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {noticed(props.minutes)}
          </Text>
        </Stack>
        <Stack gap="12" align="center" style={{ paddingTop: theme.space['24'] }}>
          <PillButton
            label={addToPass()}
            tone="green"
            block
            onPress={props.onAdd}
            testID="critters-befriended-add"
          />
          {props.onShare === null ? null : (
            <TextLink
              label={shareWithCrew()}
              onPress={props.onShare}
              testID="critters-befriended-share"
            />
          )}
        </Stack>
      </View>
    </Scaffold>
  );
}
