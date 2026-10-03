/**
 * The Help hub's body (3k-6) under the hero: CALL {general} and the side line, the four problem
 * tiles, the nearest facility with GO, the phrase card, the Help share controls, SOS to the crew,
 * the insurance footer and the disclaimer. CALL tiles are plain dialer links; nothing here says
 * anyone contacts emergency services for the traveller.
 */
import type { HelpProblem } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Icon } from '@/ui/icons/Icon';
import { Stack } from '@/ui/layout/Stack';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';
import { EmergencyTiles } from '@/ui/trip/EmergencyTiles';
import { PhraseCard } from '@/ui/trip/PhraseCard';

import { HelpHero, type HelpHeroProps } from './help-hero';
import type { HubFacility, HubModel } from './help-model';
import { ShareControls, type ShareControlsProps } from './share-controls';
import { distanceIn } from '@/lib/i18n/formats';

export interface HelpViewProps {
  readonly hero: HelpHeroProps;
  readonly model: HubModel;
  readonly share: ShareControlsProps;
  /** "Insurance: Chubb Travel · the policy card is in Bookings", or null when none is on file. */
  readonly insurer: string | null;
  readonly playing: boolean;
  readonly onCall: (number: string) => void;
  readonly onProblem: (problem: HelpProblem) => void;
  readonly onGo: (facility: HubFacility) => void;
  readonly onPlay: (() => void) | null;
  readonly onShowPhrase: () => void;
  readonly onSos: (() => void) | null;
  readonly onInsurance: () => void;
}

const PROBLEM_ICONS = {
  hurt: 'heart',
  lost_stolen: 'wallet',
  lost: 'pin',
  missed_ride: 'car',
} as const;

function facilityDetail(facility: HubFacility, t: ReturnType<typeof useLingui>['t']): string {
  if (facility.minutes !== null) {
    const minutes = facility.minutes;
    return t({ id: 'safety.help.byCar', message: `${minutes} min by car` });
  }
  if (facility.distanceM !== null) {
    const away = distanceIn(facility.distanceM);
    const n = away.value.toFixed(1);
    return away.unit === 'mi'
      ? t({ id: 'safety.help.awayMiles', message: `${n} mi away` })
      : t({ id: 'safety.help.away', message: `${n} km away` });
  }
  return facility.phone ?? '';
}

export function HelpView(props: HelpViewProps) {
  const { model, share, insurer } = props;
  const { t } = useLingui();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const general = model.general.number;
  const problems: readonly { id: HelpProblem; label: string }[] = [
    { id: 'hurt', label: t({ id: 'safety.help.hurt', message: 'Hurt or sick' }) },
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a problem id, never copy.
    { id: 'lost_stolen', label: t({ id: 'safety.help.lostStolen', message: 'Lost or stolen' }) },
    { id: 'lost', label: t({ id: 'safety.help.imLost', message: "I'm lost" }) },
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a problem id, never copy.
    { id: 'missed_ride', label: t({ id: 'safety.help.missedRide', message: 'Missed a ride' }) },
  ];
  const facility = model.facility;
  const gloss = model.phrase?.gloss ?? '';
  const name = facility?.name ?? '';
  const clinicName = facility?.open24h
    ? t({ id: 'safety.help.open24', message: `${name} · Open 24h` })
    : name;
  return (
    <Scaffold variant="dark" edges={[]} testID="help-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + theme.space['32'] }}>
        <HelpHero {...props.hero} />
        <Stack gap="16" style={{ padding: theme.size.gutter, paddingTop: theme.space['24'] }}>
          <EmergencyTiles
            testID="help-tiles"
            primary={{
              number: general,
              label:
                model.coverage === 'limited'
                  ? t({ id: 'safety.help.limitedLabel', message: 'Emergency, from any mobile' })
                  : model.general.label,
              onCall: () => props.onCall(general),
            }}
            {...(model.side === null
              ? {}
              : {
                  secondary: {
                    number: model.side.number,
                    label: model.side.label,
                    onCall: () => props.onCall(model.side?.number ?? general),
                  },
                })}
            problems={problems.map((problem) => ({
              ...problem,
              icon: <Icon name={PROBLEM_ICONS[problem.id]} size={28} decorative />,
              onPress: () => props.onProblem(problem.id),
            }))}
            {...(facility === null
              ? {}
              : {
                  clinic: {
                    name: clinicName,
                    detail: facilityDetail(facility, t),
                    actionLabel: t({ id: 'safety.help.go', message: 'Go' }),
                    onGo: () => props.onGo(facility),
                  },
                })}
          />
          {model.coverage === 'limited' ? (
            <SecondaryText testID="help-limited">
              {t({
                id: 'safety.help.limited',
                message: `Limited coverage here: ${general} works from any mobile phone. Your embassy can help too.`,
              })}
            </SecondaryText>
          ) : null}
          {facility === null && model.coverage === 'full' ? (
            <SecondaryText testID="help-no-facility">
              {t({
                id: 'safety.help.noFacility',
                message: 'No clinic on file near here yet. The numbers above work everywhere.',
              })}
            </SecondaryText>
          ) : null}
          {model.phrase === null ? null : (
            <PhraseCard
              tone="paper"
              testID="help-phrase"
              phrase={model.phrase.text}
              lang={model.phrase.language}
              translation={t({
                id: 'safety.help.phraseGloss',
                message: `"${gloss}" Show it, or tap to play.`,
              })}
              playing={props.playing}
              {...(props.onPlay === null ? {} : { onPlay: props.onPlay })}
            />
          )}
          {model.phrase === null ? null : (
            <TextLink
              label={t({ id: 'safety.help.showIt', message: 'Show it big' })}
              onPress={props.onShowPhrase}
              testID="help-show-it"
            />
          )}
          <ShareControls {...share} />
          {props.onSos === null ? null : (
            <PillButton
              label={t({ id: 'safety.help.sos', message: 'SOS to the crew' })}
              variant="destructive"
              block
              onPress={props.onSos}
              testID="help-sos"
            />
          )}
          <Stack gap="6">
            {insurer === null ? (
              <TextLink
                label={t({ id: 'safety.help.noInsurance', message: 'No insurance on file · add' })}
                onPress={props.onInsurance}
                testID="help-insurance-add"
              />
            ) : (
              <Text variant="bodySm" color={theme.semantic.text.secondary} testID="help-insurance">
                {insurer}
              </Text>
            )}
            <SecondaryText>
              {t({
                id: 'safety.help.disclaimer',
                message: `CritterPass tells your crew. For emergencies call ${general}.`,
              })}
            </SecondaryText>
          </Stack>
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
