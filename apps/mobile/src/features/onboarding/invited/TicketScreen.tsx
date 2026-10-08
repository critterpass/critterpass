/**
 * 3a-10 "Invite: a seat for you": who saved the seat, the headline naming the invitee (only on
 * their own open named seat; a forwarded or generic link reads "a seat in {crew}"), the crew ticket
 * and the members already in. TAKE THE SEAT goes to the three-tap pass, or straight into the crew
 * for someone who already has a pass; a full trip offers the waitlist truthfully. Every other state
 * (loading, expired, revoked, used up, unknown, offline, referral) replaces the ticket in place.
 */
import { t } from '@lingui/core/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { upper } from '@cp/i18n';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { isOnboardingComplete } from '@/lib/links/pending';
import { PillButton } from '@/ui/buttons/PillButton';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { Avatar } from '@/ui/people/Avatar';
import { Skeleton } from '@/ui/states/Skeleton';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { InviteProblem, type InviteProblemKind } from './InviteProblem';
import { InviteTicket } from './InviteTicket';
import { useInviteServices } from './invite-services';
import { inviteSession } from './invite-session';
import { acceptInvite, problemCardOf, type JoinProblem } from './join';
import { HANDOFF_ROUTES, INVITED_ROUTES, withoutSeatRoute } from './routes';
import { canTakeSeat, type TicketModel } from './ticket-model';
import { useInvitePreview } from './use-invite-preview';

const useStyles = makeStyles((th) => ({
  content: {
    flex: 1,
    paddingHorizontal: th.space['20'],
    gap: th.space['20'],
    paddingTop: th.space['12'],
  },
  inviter: { flexDirection: 'row', alignItems: 'center', gap: th.space['12'] },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['8'],
    gap: th.space['8'],
    alignItems: 'center',
  },
}));

function headline(model: TicketModel, locale: string): string {
  const crew = model.crewName ?? '';
  const name = model.inviteeFirstName;
  const place = model.place;
  if (name !== null && place !== null) {
    return upper(
      t({
        id: 'onboarding.invite.ticket.titleNamed',
        message: `${name}, you’re coming to ${place}`,
      }),
      locale,
    );
  }
  if (name !== null) {
    return upper(
      t({
        id: 'onboarding.invite.ticket.titleNamedCrew',
        message: `${name}, ${crew} wants you in`,
      }),
      locale,
    );
  }
  return upper(
    t({ id: 'onboarding.invite.ticket.titleGeneric', message: `A seat in ${crew}` }),
    locale,
  );
}

function Footer({
  model,
  busy,
  onTake,
}: {
  model: TicketModel;
  busy: boolean;
  onTake: () => void;
}) {
  const theme = useTheme();
  const crew = model.crewName ?? '';
  const cap = model.seat?.cap ?? 0;
  const full = model.status === 'full';
  return (
    <>
      {full ? (
        <Text
          variant="bodySm"
          color={theme.semantic.text.secondary}
          style={{ textAlign: 'center' }}
        >
          {t({
            id: 'onboarding.invite.ticket.fullLine',
            message: `${crew} is full at ${cap}. You join the waitlist and get the next free seat.`,
          })}
        </Text>
      ) : null}
      <PillButton
        label={
          full
            ? t({ id: 'onboarding.invite.ticket.waitlist', message: 'Join the waitlist' })
            : t({ id: 'onboarding.invite.ticket.take', message: 'Take the seat' })
        }
        onPress={onTake}
        loading={busy}
        block
        sheen={!full}
        testID="invite-take-seat"
      />
      <InlineAction
        label={t({ id: 'onboarding.invite.ticket.lookAround', message: 'Just look around first' })}
        onPress={() => router.replace(withoutSeatRoute())}
        testID="invite-look-around"
      />
    </>
  );
}

export function TicketScreen() {
  // 3a-10 draws no back control: "Just look around first" is the way out of the invite.
  useNoBackByDesign();
  const styles = useStyles();
  const locale = useLocale();
  const services = useInviteServices();
  const localFirst = useContext(LocalFirstContext);
  const params = useLocalSearchParams<{ code?: string; seat?: string }>();
  const code = params.code ?? null;
  const seat = params.seat ?? null;
  const target = useMemo(
    () =>
      code === null ? null : { kind: 'invite' as const, code, ...(seat === null ? {} : { seat }) },
    [code, seat],
  );
  const { model, retry } = useInvitePreview(target);
  const [joinProblem, setJoinProblem] = useState<JoinProblem | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (code !== null) inviteSession.open(code, seat, services.now());
  }, [code, seat, services]);

  const take = () => {
    if (code === null) return;
    // A first-time visitor makes their pass first; someone with a pass joins right away.
    if (!isOnboardingComplete() || localFirst === null) {
      router.push(INVITED_ROUTES.pass);
      return;
    }
    setBusy(true);
    void acceptInvite(localFirst.commands, { code, ...(seat === null ? {} : { seat }) })
      .then((outcome) => {
        if (outcome.kind === 'joined') {
          inviteSession.setJoined(outcome.result);
          router.replace(INVITED_ROUTES.manifest);
        } else {
          setJoinProblem(outcome.problem);
        }
      })
      .finally(() => setBusy(false));
  };

  const problem: InviteProblemKind | null =
    joinProblem === null ? null : problemCardOf(joinProblem);
  const status = model.status;
  const ready = status !== 'loading';
  const seatOpen = problem === null && (status === 'active' || status === 'full');
  const shownProblem: InviteProblemKind | null =
    problem ?? (status === 'loading' || status === 'active' || status === 'full' ? null : status);
  const inviter = model.inviterFirstName ?? '';

  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="screen-onboarding-invite-ticket">
      <View style={styles.content}>
        {model.inviterFirstName !== null ? (
          <View style={styles.inviter}>
            <Avatar name={inviter} size="md" />
            <Text variant="rowTitle">
              {t({ id: 'onboarding.invite.ticket.saved', message: `${inviter} saved you a seat` })}
            </Text>
          </View>
        ) : null}
        {!ready ? (
          <Skeleton
            preset="card"
            label={t({ id: 'onboarding.invite.ticket.loading', message: 'Loading your invite' })}
            testID="invite-ticket-loading"
          />
        ) : seatOpen || shownProblem === null ? (
          <>
            <Text variant="h1" accessibilityRole="header">
              {headline(model, locale)}
            </Text>
            <InviteTicket model={model} arrive />
          </>
        ) : (
          <InviteProblem
            kind={shownProblem}
            inviterFirstName={model.inviterFirstName}
            crewName={model.crewName}
            action={
              shownProblem === 'offline'
                ? {
                    label: t({ id: 'onboarding.invite.problem.retry', message: 'Try again' }),
                    onPress: () => {
                      setJoinProblem(null);
                      retry();
                    },
                  }
                : shownProblem === 'referral'
                  ? {
                      label:
                        withoutSeatRoute() === HANDOFF_ROUTES.home
                          ? t({ id: 'onboarding.invite.pass.home', message: 'Go home' })
                          : t({
                              id: 'onboarding.invite.problem.startPass',
                              message: 'Make my pass',
                            }),
                      onPress: () => router.replace(withoutSeatRoute()),
                    }
                  : {
                      label: t({
                        id: 'onboarding.invite.problem.typeCode',
                        message: 'Type a code instead',
                      }),
                      onPress: () => router.replace(INVITED_ROUTES.code),
                    }
            }
          />
        )}
      </View>
      {ready && seatOpen && canTakeSeat(status) ? (
        <View style={styles.footer}>
          <Footer model={model} busy={busy} onTake={take} />
        </View>
      ) : null}
    </Scaffold>
  );
}
