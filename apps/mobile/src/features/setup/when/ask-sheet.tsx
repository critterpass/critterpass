/**
 * The guide's private ask, answered in the app (undesigned; the push's quick replies land on the
 * same command): "Freed it", "Can't move it", or a few words the guide reads for intent. The
 * member is told what the organiser learns (only whether the week works, never what the block
 * is). Answers queue offline (`answer_availability_ask`).
 */
import { t } from '@lingui/core/macro';
import { useState, type ComponentType } from 'react';

import type { AskAnswer } from '@cp/domain';

import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';

import { answerAvailabilityAskCommand } from '../data/commands';
import { useSetupTrip, type SetupTrip } from '../data/setup-trip';
import { useMe } from '../data/use-me';
import { setupRoutes } from '../routes';
import type { SheetWaitingProps } from '../shell/frame';

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

/** How the ask sheet is drawn; the trip read and the answer command stay here. */
export interface AskSheetLook {
  readonly View: ComponentType<AskSheetViewProps>;
  readonly Waiting: ComponentType<SheetWaitingProps>;
}

/** The ask sheet over the dates step (`/{tripId}/setup/ask/{askId}`), for its one target. */
export function AskSheet({
  trip,
  askId,
  answered = false,
  look,
}: {
  readonly trip: SetupTrip;
  readonly askId: string;
  /** The push's quick reply already sent the answer. */
  readonly answered?: boolean;
  readonly look: AskSheetLook;
}) {
  const { View } = look;
  const answer = useCommand(answerAvailabilityAskCommand);
  const [sent, setSent] = useState(answered);
  const organiser = trip.members.find((member) => member.organiser)?.name ?? '';
  const send = (payload: { answer?: AskAnswer; text?: string }) => {
    void answer.send({ ask_id: askId, ...payload }).then((result) => {
      if (result.kind === 'queued' || result.kind === 'applied') setSent(true);
    });
  };
  return (
    <View
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
  look,
}: {
  readonly tripId: string;
  readonly askId: string;
  readonly answered: boolean;
  readonly look: AskSheetLook;
}) {
  const { Waiting } = look;
  const me = useMe();
  const trip = useSetupTrip(tripId, me);
  if (trip === undefined || trip === null) {
    return (
      <Waiting
        state={trip === undefined ? 'loading' : 'missing'}
        title={t({ id: 'setup.ask.title', message: 'About your maybe days' })}
        onDismiss={() => goBackOr(setupRoutes.step(tripId, 'when'))}
        testID="ask-sheet-waiting"
      />
    );
  }
  return <AskSheet trip={trip} askId={askId} answered={answered} look={look} />;
}
