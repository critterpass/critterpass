/**
 * The destination page's two ways forward. PITCH TO THE CREW puts the place on a crew's board:
 * with one crew it goes there, with several the user picks which, with none the crew is started
 * right here (a name, one button) and the pitch carries on. Back from the pitch, the page says
 * whose vote the place is on and offers the way to it. SOLO TRIP asks once, then starts a trip for one that skips the vote.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { QuickCrewStart } from '@/features/vote';

import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { SplitCtaRow } from '@/ui/buttons/SplitCtaRow';
import { TextLink } from '@/ui/buttons/TextLink';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { useLiveRows } from '../data/live-rows';
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

/* eslint-disable lingui/no-unlocalized-strings -- SQL and a route path, never copy. */
/** The crews whose open destination vote already has this place on it (by the name it was added under). */
const ON_VOTE_SQL = `SELECT DISTINCT p.crew_id FROM poll_options o JOIN polls p ON p.id = o.poll_id
  WHERE p.kind = 'destination' AND p.status = 'open' AND o.label = ? AND o.eliminated_at IS NULL`;
const ON_VOTE_TABLES = ['poll_options', 'polls'];
const HOME_TAB = '/(tabs)';
/* eslint-enable lingui/no-unlocalized-strings */

/** "On {crew}'s vote" with the way to the board, once the place has been added to a crew's vote. */
function OnTheVote({
  placeName,
  crews,
}: {
  readonly placeName: string;
  readonly crews: readonly CrewChoice[];
}) {
  const { t } = useLingui();
  const { rows } = useLiveRows<{ crew_id: string }>(
    ON_VOTE_SQL,
    placeName === '' ? null : [placeName],
    ON_VOTE_TABLES,
  );
  const crew = crews.find((candidate) => rows.some((row) => row.crew_id === candidate.id));
  if (crew === undefined) return null;
  const crewName = crew.name;
  return (
    <Row gap="10" align="center" wrap testID="explore-on-the-vote">
      <Text variant="bodySm" style={{ flexShrink: 1 }}>
        {t({ id: 'explore.pitch.onTheVote', message: `${placeName} is on ${crewName}’s vote.` })}
      </Text>
      <InlineAction
        label={t({ id: 'explore.pitch.seeVote', message: 'See the vote' })}
        onPress={() => router.dismissTo(HOME_TAB)}
        testID="explore-see-vote"
      />
    </Row>
  );
}

export function DestinationActions(props: DestinationActionsProps) {
  const styles = useStyles();
  const { t, i18n } = useLingui();
  const { placeName, guideName } = props;
  // A crew started from this page: the form stays up until the crew has synced and the pitch opens.
  const [starting, setStarting] = useState(false);
  // The pitch opens over this page; under it the picker closes, so coming back finds the two
  // buttons as they were, not a question that has been answered.
  const pitchTo = (crewId: string) => {
    props.onPickCrew(crewId);
    props.onCancel();
  };
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
      {props.mode === 'actions' ? <OnTheVote placeName={placeName} crews={props.crews} /> : null}
      {props.mode !== 'crews' ? null : props.crews.length === 0 || starting ? (
        <QuickCrewStart
          placeName={placeName}
          crewIds={props.crews.map((crew) => crew.id)}
          onStarted={() => setStarting(true)}
          onReady={(crewId) => {
            setStarting(false);
            pitchTo(crewId);
          }}
          testID="explore-pitch-no-crew"
        />
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
                onPress={() => pitchTo(crew.id)}
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
