/**
 * 3a-11 "Got a code?": six boxes (or a pasted link through the system paste control), a green ring
 * on the sixth character when the code is found, then the crew card unfolds with its guide landing
 * on it. A wrong code shakes pink with one line of help; expired, used-up, full, offline and
 * too-many-tries states say so in place. A pasted personal link goes to its own ticket.
 */
import { t } from '@lingui/core/macro';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { normalizeJoinCode } from '@cp/domain';
import { upper } from '@cp/i18n';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { isOnboardingComplete } from '@/lib/links/pending';
import { parseIncomingLink } from '@/lib/links/router';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { CodeBoxes, type CodeStatus } from '@/ui/inputs/CodeBoxes';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { FoundCrewCard } from './FoundCrewCard';
import { InviteProblem, type InviteProblemKind } from './InviteProblem';
import { useInviteServices } from './invite-services';
import { inviteSession } from './invite-session';
import { acceptInvite, problemCardOf, wrongCodeToastId, type JoinProblem } from './join';
import { INVITED_ROUTES } from './routes';
import { ticketProblem } from './ticket-model';
import { useInvitePreview } from './use-invite-preview';

const CODE_LENGTH = 6;

const useStyles = makeStyles((th) => ({
  content: { flex: 1, paddingHorizontal: th.space['20'], gap: th.space['16'] },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paste: { width: 140, height: MIN_TOUCH_TARGET },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['8'],
    gap: th.space['8'],
    alignItems: 'center',
  },
}));

export function CodeScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const services = useInviteServices();
  const localFirst = useContext(LocalFirstContext);
  const params = useLocalSearchParams<{ notice?: string; pasted?: string }>();
  const [typed, setTyped] = useState('');
  const [pastedFrom, setPastedFrom] = useState<string | null>(null);
  const [joinProblem, setJoinProblem] = useState<JoinProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const code = typed.length === CODE_LENGTH ? normalizeJoinCode(typed) : null;
  const target = useMemo(() => (code === null ? null : { kind: 'invite' as const, code }), [code]);
  const { model } = useInvitePreview(target);

  useEffect(() => {
    if (code !== null) inviteSession.open(code, null, services.now());
  }, [code, services]);

  const onPaste = (text: string) => {
    const link = parseIncomingLink(text.trim());
    if (link?.kind === 'invite' && link.seat !== undefined) {
      router.replace({
        pathname: INVITED_ROUTES.ticket,
        params: { code: link.code, seat: link.seat },
      });
      return;
    }
    const pastedCode = link?.kind === 'invite' ? link.code : normalizeJoinCode(text.trim());
    if (pastedCode !== null) {
      setTyped(pastedCode);
      setPastedFrom(
        t({ id: 'onboarding.invite.code.pastedFrom', message: 'Pasted from your clipboard' }),
      );
    }
  };

  useEffect(() => {
    // The link the router handed over on arrival is pasted once, as if tapped.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.pasted !== undefined) onPaste(params.pasted);
    // Only the link handed over on arrival, never a later one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const found = code !== null && (model.status === 'active' || model.status === 'full');
  const wrong = typed.length === CODE_LENGTH && (code === null || model.status === 'not_found');
  const status: CodeStatus = found ? 'valid' : wrong ? 'invalid' : 'idle';

  useEffect(() => {
    if (!wrong) return;
    toast.show({
      id: wrongCodeToastId(typed),
      title: t({ id: 'onboarding.invite.code.wrongToast', message: 'No crew with that code' }),
    });
  }, [wrong, typed]);
  const problem: InviteProblemKind | null =
    joinProblem !== null
      ? problemCardOf(joinProblem)
      : code !== null && model.status !== 'not_found'
        ? ticketProblem(model.status)
        : null;

  const join = () => {
    if (code === null) return;
    if (!isOnboardingComplete() || localFirst === null) {
      router.push(INVITED_ROUTES.pass);
      return;
    }
    setBusy(true);
    void acceptInvite(localFirst.commands, { code })
      .then((outcome) => {
        if (outcome.kind === 'joined') {
          inviteSession.setJoined(outcome.result);
          router.replace(INVITED_ROUTES.manifest);
        } else setJoinProblem(outcome.problem);
      })
      .finally(() => setBusy(false));
  };

  const crew = model.crewName ?? '';
  const inviter = model.inviterFirstName ?? '';
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="invite-code-screen">
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
          onChangeText={(next) => {
            setJoinProblem(null);
            setPastedFrom(null);
            setTyped(next.toUpperCase());
          }}
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
          />
        ) : found ? (
          <FoundCrewCard model={model} />
        ) : null}
      </View>
      {found && problem === null ? (
        <View style={styles.footer}>
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
          <InlineAction
            label={t({
              id: 'onboarding.invite.code.wrongCrew',
              message: `Wrong crew? Ask ${inviter} for a new code`,
            })}
            onPress={() => setTyped('')}
          />
        </View>
      ) : null}
    </Scaffold>
  );
}
