/**
 * 3a-10 "Invite: a seat for you": who saved the seat, the headline naming the invitee (only on
 * their own open named seat; a forwarded or generic link reads "a seat in {crew}"), the crew ticket
 * and the members already in. TAKE THE SEAT goes to the three-tap pass, or straight into the crew
 * for someone who already has a pass; a full trip offers the waitlist truthfully. Every other state
 * (loading, expired, revoked, used up, unknown, offline, referral) replaces the ticket in place.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { Avatar } from '@/ui/people/Avatar';
import { Skeleton } from '@/ui/states/Skeleton';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { InviteProblem } from './InviteProblem';
import { InviteTicket } from './InviteTicket';
import { HANDOFF_ROUTES, INVITED_ROUTES, withoutSeatRoute } from './routes';
import { canTakeSeat, type TicketModel } from './ticket-model';
import { useTicketEntry } from './use-ticket-entry';

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
  const { model, busy, take, ready, seatOpen, shownProblem, retry } = useTicketEntry();
  const status = model.status;
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
                    onPress: retry,
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
