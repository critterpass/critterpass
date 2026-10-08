/**
 * Where a Google or Outlook sign-in comes back (`critterpass://setup/calendar/connected`,
 * undesigned; the page pattern with one line and one way on): finishes the connection with
 * `connect_calendar` from this device, then says whether it worked. Denied or failed sign-ins say
 * so, and the way back is always the same button.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';
import { PillButton } from '@/ui/buttons/PillButton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { connectCalendarCommand } from '../data/commands';
import type { OAuthReturn } from './oauth';

type Outcome = 'connecting' | 'connected' | 'denied' | 'failed';

const useStyles = makeStyles((th) => ({
  content: {
    flex: 1,
    paddingHorizontal: th.space['20'],
    paddingTop: th.space['32'],
    gap: th.space['12'],
  },
  footer: { paddingHorizontal: th.space['20'], paddingBottom: th.space['8'] },
}));

export function CalendarConnectedView({
  outcome,
  onDone,
}: {
  readonly outcome: Outcome;
  readonly onDone: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const copy = {
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
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID={`calendar-connected-${outcome}`}>
      <View style={styles.content}>
        <Text variant="h1" accessibilityRole="header">
          {copy.title}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {copy.line}
        </Text>
      </View>
      <View style={styles.footer}>
        <PillButton
          label={t({ id: 'setup.connected.back', message: 'Back to setup' })}
          onPress={onDone}
          disabled={outcome === 'connecting'}
          testID="calendar-connected-back"
        />
      </View>
    </Scaffold>
  );
}

export function CalendarConnectedScreen({ result }: { readonly result: OAuthReturn }) {
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
  return <CalendarConnectedView outcome={outcome} onDone={done} />;
}
