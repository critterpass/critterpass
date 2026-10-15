/**
 * Where a Google or Outlook sign-in comes back (`critterpass://setup/calendar/connected`,
 * undesigned; the page pattern with one line and one way on): finishes the connection with
 * `connect_calendar` from this device, then says whether it worked. Denied or failed sign-ins say
 * so, and the way back is always the same button.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useRef, useState, type ComponentType } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';

import { connectCalendarCommand } from '../data/commands';
import type { OAuthReturn } from './oauth';

export type Outcome = 'connecting' | 'connected' | 'denied' | 'failed';

export interface CalendarConnectedViewProps {
  readonly outcome: Outcome;
  readonly onDone: () => void;
}

/** What the page says for each way the sign-in came back, for either look. */
export function connectedWords(outcome: Outcome): {
  readonly title: string;
  readonly line: string;
} {
  return {
    connecting: {
      title: t({ id: 'setup.connected.connectingTitle', message: 'Connecting…' }),
      line: t({
        id: 'setup.connected.connectingLine',
        message: 'Reading free and busy days only.',
      }),
    },
    connected: {
      title: t({ id: 'setup.connected.doneTitle', message: 'Calendar connected' }),
      line: t({
        id: 'setup.connected.doneLine',
        message: 'Your free days count now. Event details never leave your calendar.',
      }),
    },
    denied: {
      title: t({ id: 'setup.connected.deniedTitle', message: 'Not connected' }),
      line: t({
        id: 'setup.connected.deniedLine',
        message:
          'You said no to the calendar. Connect this phone’s calendar or mark days by hand instead.',
      }),
    },
    failed: {
      title: t({ id: 'setup.connected.failedTitle', message: 'That didn’t work' }),
      line: t({
        id: 'setup.connected.failedLine',
        message: 'The calendar didn’t connect. Try again from setup in a moment.',
      }),
    },
  }[outcome];
}

export function CalendarConnectedScreen({
  result,
  View,
}: {
  readonly result: OAuthReturn;
  /** How the page is drawn. */
  readonly View: ComponentType<CalendarConnectedViewProps>;
}) {
  const { send } = useCommand(connectCalendarCommand);
  const [outcome, setOutcome] = useState<Outcome>(
    result.kind === 'authorized' ? 'connecting' : result.kind,
  );
  const started = useRef(false);
  useEffect(() => {
    if (result.kind !== 'authorized' || started.current) return;
    started.current = true;
    void send({ provider: result.provider, auth_code: result.code, state: result.state }).then(
      (sent) => setOutcome(sent.kind === 'applied' ? 'connected' : 'failed'),
      () => setOutcome('failed'),
    );
  }, [result, send]);
  const done = () => goBackOr();
  return <View outcome={outcome} onDone={done} />;
}
