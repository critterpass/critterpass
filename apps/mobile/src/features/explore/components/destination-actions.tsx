/**
 * The destination page's two ways forward. PITCH TO THE CREW puts the place on a crew's board:
 * with one crew it goes there, with several the user picks which, with none the page says a pitch
 * needs a crew. SOLO TRIP asks once, then starts a trip for one that skips the vote.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { SplitCtaRow } from '@/ui/buttons/SplitCtaRow';
import { TextLink } from '@/ui/buttons/TextLink';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import type { CrewChoice } from '../queries';

export type ActionsMode = 'actions' | 'crews' | 'solo';

export interface DestinationActionsProps {
  readonly mode: ActionsMode;
  readonly placeName: string;
  readonly guideName: string;
  readonly crews: readonly CrewChoice[];
  readonly soloBusy: boolean;
  readonly onPitch: () => void;
  readonly onPickCrew: (crewId: string) => void;
  readonly onSolo: () => void;
  readonly onConfirmSolo: () => void;
  readonly onCancel: () => void;
}

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
    gap: t.space['12'],
  },
}));

export function DestinationActions(props: DestinationActionsProps) {
  const styles = useStyles();
  const { t, i18n } = useLingui();
  const { placeName, guideName } = props;
  if (props.mode === 'solo') {
    return (
      <Stack style={styles.card} testID="explore-solo-confirm">
        <Text variant="h3">
          {upper(t({ id: 'explore.solo.title', message: `Just you, ${placeName}` }), i18n.locale)}
        </Text>
        <Text variant="body">
          {t({
            id: 'explore.solo.body',
            message: `${guideName} plans it with you. No vote, no RSVP. A solo trip doesn't use a crew's free first trip.`,
          })}
        </Text>
        <PillButton
          label={t({ id: 'explore.solo.start', message: 'Start solo trip' })}
          onPress={props.onConfirmSolo}
          loading={props.soloBusy}
          testID="explore-solo-start"
        />
        <TextLink
          label={t({ id: 'explore.solo.cancel', message: 'Not now' })}
          onPress={props.onCancel}
          testID="explore-solo-cancel"
        />
      </Stack>
    );
  }
  return (
    <Stack gap="10">
      {props.mode !== 'crews' ? null : props.crews.length === 0 ? (
        <Text variant="bodySm" testID="explore-pitch-no-crew">
          {t({
            id: 'explore.pitch.noCrew',
            message: 'Pitching needs a crew. Start one from Home, or take this one solo.',
          })}
        </Text>
      ) : (
        <Stack gap="8" testID="explore-pitch-crews">
          <Text variant="bodySm">
            {t({ id: 'explore.pitch.whichCrew', message: 'Which crew gets the pitch?' })}
          </Text>
          <Row gap="8" wrap>
            {props.crews.map((crew) => (
              <InlineAction
                key={crew.id}
                kind="choice"
                label={crew.name}
                onPress={() => props.onPickCrew(crew.id)}
                testID={`explore-pitch-crew-${crew.id}`}
              />
            ))}
          </Row>
        </Stack>
      )}
      <SplitCtaRow
        primary={
          <PillButton
            label={t({ id: 'explore.cta.pitch', message: 'Pitch to the crew' })}
            onPress={props.onPitch}
            disabled={props.mode === 'crews'}
            testID="explore-pitch"
          />
        }
        secondary={
          <PillButton
            label={t({ id: 'explore.cta.solo', message: 'Solo trip' })}
            variant="secondary"
            block={false}
            onPress={props.onSolo}
            testID="explore-solo"
          />
        }
      />
    </Stack>
  );
}
