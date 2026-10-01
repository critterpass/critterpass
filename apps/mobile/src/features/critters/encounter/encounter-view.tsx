/**
 * An encounter (3l-4, legendary 3l-10) from props: the scene above, the card below with the tier
 * line, "{name} is here", why it's shy, and the hold ring. The ring only takes a hold once the
 * dwell has made it ready; then a visible Befriend link (and the ring's accessibility action)
 * completes it without holding. Wandered off (3l-5) and befriended (3l-6) are their own views.
 */
import { upper } from '@cp/i18n';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { TextLink } from '@/ui/buttons/TextLink';
import { EncounterCard } from '@/ui/critters/EncounterCard';
import { tierWord } from '@/ui/critters/tier';
import { HoldRing } from '@/ui/inputs/HoldRing';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { EmptyState } from '@/ui/states/EmptyState';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import {
  backToDay,
  befriendAction,
  encounterOver,
  formOf,
  holdLabel,
  holdTitle,
  isHere,
  liveBody,
  modeLabel,
  nothingHere,
  sceneLabel,
  stayedFor,
  stayTitle,
  tapInstead,
  youreAt,
} from './encounter-copy';
import type { SpawnArt } from './encounter-model';
import { BefriendedView, WanderedCard, type ForecastView } from './result-views';
import { EncounterScene } from './scene';

export type EncounterViewProps =
  | { readonly kind: 'nothing'; readonly onBack: () => void }
  | {
      readonly kind: 'live' | 'wandered';
      readonly place: string;
      readonly habitat: string;
      readonly art: SpawnArt;
      readonly phase: string;
      readonly progress: number;
      readonly legendary: boolean;
      readonly crewLine: string | null;
      readonly minutes: number;
      readonly forecast: ForecastView | null;
      readonly onHold: () => void;
      readonly onTap: () => void;
      readonly onRemind: () => void;
      readonly onBack: () => void;
    }
  | {
      readonly kind: 'befriended';
      readonly art: SpawnArt;
      readonly eyebrow: string;
      readonly formChip: string | null;
      readonly crewChip: string | null;
      readonly minutes: number;
      readonly onAdd: () => void;
      readonly onShare: (() => void) | null;
    };

const useStyles = makeStyles((th) => ({
  sceneWrap: { flex: 1 },
  card: { paddingHorizontal: th.space['12'], paddingBottom: th.space['12'] },
  empty: { flex: 1, padding: th.size.gutter, gap: th.space['12'], justifyContent: 'center' },
}));

export function EncounterView(props: EncounterViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  if (props.kind === 'nothing') {
    const copy = nothingHere();
    return (
      <Scaffold variant="dark" edges={['top', 'bottom']} testID="critters-encounter-nothing">
        <View style={{ paddingHorizontal: theme.size.gutter }}>
          <BackEyebrow
            label={upper(backToDay(), locale)}
            onPress={props.onBack}
            testID="critters-encounter-back"
          />
        </View>
        <View style={styles.empty}>
          <EmptyState
            guide="tokek"
            guideName={GUIDE_STICKERS.tokek.name}
            title={copy.title}
            line={copy.body}
            action={{ label: backToDay(), onPress: props.onBack }}
          />
        </View>
      </Scaffold>
    );
  }
  if (props.kind === 'befriended') {
    return (
      <BefriendedView
        art={props.art}
        eyebrow={props.eyebrow}
        formChip={props.formChip}
        crewChip={props.crewChip}
        minutes={props.minutes}
        onAdd={props.onAdd}
        onShare={props.onShare}
      />
    );
  }
  const { art } = props;
  const ready = props.phase === 'ready';
  const tier = tierWord(art.rarity);
  const wandered = props.kind === 'wandered';
  const name = art.name === null ? null : upper(art.name, locale);
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID={`critters-encounter-${props.phase}`}>
      <View style={styles.sceneWrap}>
        <EncounterScene
          mode={upper(wandered ? encounterOver() : modeLabel(props.legendary), locale)}
          context={wandered ? upper(stayedFor(props.minutes), locale) : youreAt(props.place)}
          label={sceneLabel(props.place)}
          critterKey={art.key}
          seed={art.seed}
          form={art.form}
          name={art.name ?? ''}
          progress={props.progress}
          legendary={props.legendary}
          state={wandered ? 'wandered' : ready ? 'ready' : 'live'}
        />
      </View>
      <View style={styles.card}>
        {wandered ? (
          <WanderedCard
            tier={art.rarity}
            habitat={props.habitat}
            place={props.place}
            minutes={props.minutes}
            forecast={props.forecast}
            onRemind={props.onRemind}
            onBack={props.onBack}
          />
        ) : (
          <EncounterCard
            tier={art.rarity}
            habitat={upper(props.habitat, locale)}
            title={upper(isHere(name), locale)}
            body={[liveBody(props.phase, props.legendary), props.crewLine]
              .filter(Boolean)
              .join(' ')}
            action={
              <Stack gap="8" style={{ alignSelf: 'stretch' }}>
                <Row gap="14" align="center">
                  <HoldRing
                    label={upper(holdLabel(), locale)}
                    actionLabel={befriendAction()}
                    onComplete={props.onHold}
                    tone={props.legendary ? 'gold' : 'green'}
                    disabled={!ready}
                    testID="critters-encounter-hold"
                  />
                  <Stack gap="2" flex={1}>
                    <Text variant="title">{upper(ready ? holdTitle() : stayTitle(), locale)}</Text>
                    <Text variant="caption" color={theme.semantic.text.secondary}>
                      {formOf(art.name, tier, art.formNo, art.formCount)}
                    </Text>
                  </Stack>
                </Row>
                {ready ? (
                  <TextLink
                    label={tapInstead()}
                    onPress={props.onTap}
                    testID="critters-encounter-tap"
                  />
                ) : null}
              </Stack>
            }
            testID="critters-encounter-card"
          />
        )}
      </View>
    </Scaffold>
  );
}
