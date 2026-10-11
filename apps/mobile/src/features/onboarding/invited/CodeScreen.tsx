/**
 * 3a-11 "Got a code?": six boxes (or a pasted link through the system paste control), a green ring
 * on the sixth character when the code is found, then the crew card unfolds with its guide landing
 * on it. A wrong code shakes pink with one line of help; expired, used-up, full, offline and
 * too-many-tries states say so in place. A pasted personal link goes to its own ticket.
 */
import { t } from '@lingui/core/macro';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { CodeBoxes, type CodeStatus } from '@/ui/inputs/CodeBoxes';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { FoundCrewCard } from './FoundCrewCard';
import { InviteProblem } from './InviteProblem';
import { wrongCodeToastId } from './join';
import { HANDOFF_ROUTES, withoutSeatRoute } from './routes';
import { useCodeEntry } from './use-code-entry';

const useStyles = makeStyles((th) => ({
  content: { flex: 1, paddingHorizontal: th.space['20'], gap: th.space['16'] },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paste: { width: 140, height: MIN_TOUCH_TARGET },
  footer: { alignItems: 'center' },
}));

export function CodeScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const entry = useCodeEntry();
  const { typed, pastedFrom, code, model, retry, found, wrong, problem, busy, join, joinable } =
    entry;
  const onPaste = entry.onPaste;
  const status: CodeStatus = found ? 'valid' : wrong ? 'invalid' : 'idle';

  useEffect(() => {
    if (!wrong) return;
    toast.show({
      id: wrongCodeToastId(typed),
      title: t({ id: 'onboarding.invite.code.wrongToast', message: 'No crew with that code' }),
    });
  }, [wrong, typed]);
  const crew = model.crewName ?? '';
  const inviter = model.inviterFirstName ?? '';
  // The one way forward on the card, for the states JOIN cannot help with.
  const problemAction = entry.joinFailed
    ? undefined
    : problem === 'offline'
      ? {
          label: t({ id: 'onboarding.invite.problem.retry', message: 'Try again' }),
          onPress: retry,
        }
      : problem === 'referral'
        ? {
            label:
              withoutSeatRoute() === HANDOFF_ROUTES.home
                ? t({ id: 'onboarding.invite.pass.home', message: 'Go home' })
                : t({ id: 'onboarding.invite.problem.startPass', message: 'Make my pass' }),
            onPress: () => router.replace(withoutSeatRoute()),
          }
        : undefined;
  return (
    // The join footer pads the bottom inset itself and rides the keyboard; without it, the screen does.
    <Scaffold
      variant="dark"
      edges={joinable ? ['top'] : ['top', 'bottom']}
      testID="invite-code-screen"
    >
      <View style={styles.content}>
        <View style={styles.top}>
          <BackEyebrow label={t({ id: 'onboarding.invite.code.back', message: 'Back' })} />
          {Clipboard.isPasteButtonAvailable ? (
            <Clipboard.ClipboardPasteButton
              acceptedContentTypes={['url', 'plain-text']}
              displayMode="labelOnly"
              style={styles.paste}
              onPress={(data) => {
                if (data.type === 'text') onPaste(data.text);
              }}
            />
          ) : null}
        </View>
        <Text variant="h1" accessibilityRole="header">
          {upper(t({ id: 'onboarding.invite.code.title', message: 'Got a code?' }), locale)}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'onboarding.invite.code.body',
            message:
              'Six letters from whoever invited you. The same code works for a crew or a single trip.',
          })}
        </Text>
        <CodeBoxes
          value={typed}
          onChangeText={entry.setTyped}
          status={status}
          label={t({ id: 'onboarding.invite.code.label', message: 'Crew code' })}
          autoFocus
          alphanumeric
          testID="invite-code-boxes"
        />
        {pastedFrom !== null ? (
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {pastedFrom}
          </Text>
        ) : null}
        {wrong ? (
          <Text variant="bodySm" color={theme.semantic.state.urgent} testID="invite-code-wrong">
            {t({
              id: 'onboarding.invite.code.wrong',
              message: 'That code isn’t one we know. Check each letter.',
            })}
          </Text>
        ) : null}
        {code !== null && model.status === 'loading' ? (
          <Skeleton preset="card" testID="invite-code-loading" />
        ) : null}
        {problem !== null ? (
          <InviteProblem
            kind={problem}
            inviterFirstName={model.inviterFirstName}
            crewName={model.crewName}
            {...(problemAction === undefined ? {} : { action: problemAction })}
          />
        ) : found ? (
          <FoundCrewCard model={model} />
        ) : null}
      </View>
      {joinable ? (
        <KeyboardFooter style={styles.footer}>
          <PillButton
            label={
              model.status === 'full'
                ? t({
                    id: 'onboarding.invite.code.joinWaitlist',
                    message: `Join ${crew}’s waitlist`,
                  })
                : upper(t({ id: 'onboarding.invite.code.join', message: `Join ${crew}` }), locale)
            }
            onPress={join}
            loading={busy}
            block
            testID="invite-code-join"
          />
          <TextLink
            label={t({
              id: 'onboarding.invite.code.wrongCrew',
              message: `Wrong crew? Ask ${inviter} for a new code`,
            })}
            onPress={entry.clear}
            testID="invite-code-wrong-crew"
          />
        </KeyboardFooter>
      ) : null}
    </Scaffold>
  );
}
