/**
 * The guide's private ask, answered in the app (undesigned; the push's quick replies land on the
 * same command): "Freed it", "Can't move it", or a few words the guide reads for intent. The
 * member is told what the organiser learns (only whether the week works, never what the block
 * is). Answers queue offline (`answer_availability_ask`).
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';

import type { AskAnswer } from '@cp/domain';

import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { answerAvailabilityAskCommand } from '../data/commands';
import { useSetupTrip, type SetupTrip } from '../data/setup-trip';
import { useMe } from '../data/use-me';
import { setupRoutes } from '../routes';
import { GuideNote, guideName } from '../shell/guide-note';
import { SetupSheetWaiting } from '../shell/sheet-waiting';

const FREED: AskAnswer = 'freed';
// eslint-disable-next-line lingui/no-unlocalized-strings -- a wire value, never copy.
const NOT_MOVABLE: AskAnswer = 'not_movable';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['12'] },
}));

export interface AskSheetViewProps {
  readonly place: string;
  readonly guide: SetupTrip['guide'];
  readonly organiser: string;
  readonly sent: boolean;
  readonly busy: boolean;
  readonly onAnswer: (answer: AskAnswer) => void;
  readonly onWords: (text: string) => void;
  readonly onDismiss: () => void;
}

export function AskSheetView({
  place,
  guide,
  organiser,
  sent,
  busy,
  onAnswer,
  onWords,
  onDismiss,
}: AskSheetViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [words, setWords] = useState('');
  const title = t({ id: 'setup.ask.title', message: 'About your maybe days' });
  const name = guideName(guide);
  return (
    <Sheet detents={['fit']} onDismiss={onDismiss} accessibilityLabel={title} testID="ask-sheet">
      <SheetScrollView keyboardShouldPersistTaps="handled">
        <Stack style={styles.body}>
          <Text variant="h2" accessibilityRole="header">
            {title}
          </Text>
          {sent ? (
            <GuideNote
              guide={guide}
              line={t({
                id: 'setup.ask.thanks',
                message: `Thanks. I’ll only tell ${organiser} whether the week works.`,
              })}
            />
          ) : (
            <>
              <GuideNote
                guide={guide}
                line={t({
                  id: 'setup.ask.line',
                  message: `Quick one: your maybe block is the only thing between the crew and ${place}. Could you free it?`,
                })}
              />
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {t({
                  id: 'setup.ask.privacy',
                  message: `${organiser} only hears whether the week works. Never what the block is.`,
                })}
              </Text>
              <PillButton
                label={t({ id: 'setup.ask.freed', message: 'Freed it' })}
                tone="green"
                loading={busy}
                onPress={() => onAnswer(FREED)}
                testID="ask-freed"
              />
              <PillButton
                label={t({ id: 'setup.ask.notMovable', message: 'Can’t move it' })}
                variant="secondary"
                disabled={busy}
                onPress={() => onAnswer(NOT_MOVABLE)}
                testID="ask-not-movable"
              />
              <TextField
                label={t({ id: 'setup.ask.words', message: `Or tell ${name} in your words` })}
                value={words}
                onChangeText={(next) => setWords(next.slice(0, 500))}
                testID="ask-words"
              />
              {/* Always there, so the field reads as something to send; live once there are words. */}
              <InlineAction
                label={t({ id: 'setup.ask.send', message: 'Send' })}
                onPress={() => onWords(words.trim())}
                disabled={busy || words.trim() === ''}
                testID="ask-send"
              />
            </>
          )}
        </Stack>
      </SheetScrollView>
    </Sheet>
  );
}

/** The ask sheet over the dates step (`/{tripId}/setup/ask/{askId}`), for its one target. */
export function AskSheet({
  trip,
  askId,
  answered = false,
}: {
  readonly trip: SetupTrip;
  readonly askId: string;
  /** The push's quick reply already sent the answer. */
  readonly answered?: boolean;
}) {
  const answer = useCommand(answerAvailabilityAskCommand);
  const [sent, setSent] = useState(answered);
  const organiser = trip.members.find((member) => member.organiser)?.name ?? '';
  const send = (payload: { answer?: AskAnswer; text?: string }) => {
    void answer.send({ ask_id: askId, ...payload }).then((result) => {
      if (result.kind === 'queued' || result.kind === 'applied') setSent(true);
    });
  };
  return (
    <AskSheetView
      place={trip.destinationName}
      guide={trip.guide}
      organiser={organiser}
      sent={sent}
      busy={answer.pending}
      onAnswer={(value) => send({ answer: value })}
      onWords={(text) => send({ text })}
      onDismiss={() => goBackOr(setupRoutes.step(trip.tripId, 'when'))}
    />
  );
}

/** Loads the trip's facts, then the sheet (a skeleton until then; a way out when it is not here). */
export function AskSheetScreen({
  tripId,
  askId,
  answered,
}: {
  readonly tripId: string;
  readonly askId: string;
  readonly answered: boolean;
}) {
  const me = useMe();
  const trip = useSetupTrip(tripId, me);
  if (trip === undefined || trip === null) {
    return (
      <SetupSheetWaiting
        state={trip === undefined ? 'loading' : 'missing'}
        title={t({ id: 'setup.ask.title', message: 'About your maybe days' })}
        onDismiss={() => goBackOr(setupRoutes.step(tripId, 'when'))}
        testID="ask-sheet-waiting"
      />
    );
  }
  return <AskSheet trip={trip} askId={askId} answered={answered} />;
}
