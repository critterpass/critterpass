/**
 * 2.14 an invite with a seat for you: who saved it, the headline (naming the invitee only on their
 * own open named seat), the crew ticket, who is in (members by name, invited people as a count),
 * and Take the seat. A full trip shows the waitlist panel (2.18); a lapsed invite the ran-out page
 * (2.17); every other state its own page. ✕ leaves without a seat.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Avatar,
  Button,
  Card,
  CrewStack,
  Skeleton,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { guideFacts } from '../../guide-faces';
import { HANDOFF_ROUTES, INVITED_ROUTES, withoutSeatRoute } from '../../invited/routes';
import { placeCode, ticketFacts } from '../../invited/ticket-facts';
import type { TicketModel } from '../../invited/ticket-model';
import { useTicketEntry } from '../../invited/use-ticket-entry';
import { CrewTicket } from '../components/CrewTicket';
import { memberAccent } from '../components/member-colour';
import { FullTripPanel } from './FullTripPanel';
import { InviteProblemPage } from './InviteProblemPage';
import { InviteRanOut, isRanOut } from './InviteRanOut';

function headline(model: TicketModel): string {
  const crew = model.crewName ?? '';
  const name = model.inviteeFirstName;
  const place = model.place;
  if (name !== null && place !== null) {
    return t({
      id: 'onboarding.invite.ticket.titleNamed',
      message: `${name}, you’re coming to ${place}`,
    });
  }
  if (name !== null) {
    return t({
      id: 'onboarding.invite.ticket.titleNamedCrew',
      message: `${name}, ${crew} wants you in`,
    });
  }
  return t({ id: 'onboarding.invite.ticket.titleGeneric', message: `A seat in ${crew}` });
}

export function PremiumTicketPage() {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const entry = useTicketEntry();
  const { model } = entry;
  const tokek = guideFacts('tokek');
  const leave = () => router.replace(withoutSeatRoute());

  if (entry.ready && !entry.seatOpen && entry.shownProblem !== null) {
    const problem = entry.shownProblem;
    if (isRanOut(problem)) return <InviteRanOut kind={problem} model={model} code={entry.code} />;
    const action =
      problem === 'offline'
        ? {
            label: t({ id: 'onboarding.invite.problem.retry', message: 'Try again' }),
            onPress: entry.retry,
          }
        : problem === 'referral'
          ? {
              label:
                withoutSeatRoute() === HANDOFF_ROUTES.home
                  ? t({ id: 'onboarding.invite.pass.home', message: 'Go home' })
                  : t({ id: 'onboarding.invite.problem.startPass', message: 'Make my pass' }),
              onPress: leave,
            }
          : {
              label: t({
                id: 'onboarding.invite.problem.typeCode',
                message: 'Type a code instead',
              }),
              onPress: () => router.replace(INVITED_ROUTES.code),
            };
    return (
      <InviteProblemPage
        kind={problem}
        inviterFirstName={model.inviterFirstName}
        crewName={model.crewName}
        action={action}
      />
    );
  }

  const facts = ticketFacts(model, locale);
  const full = model.status === 'full';
  const inviter = model.inviterFirstName ?? '';
  const members = model.members.map((member, index) => ({
    id: `${member.name}-${String(index)}`,
    name: member.name,
    color: memberAccent(theme, member.colour),
  }));
  return (
    <FullScreen
      closeLabel={t({ id: 'common.sheet.close', message: 'Close' })}
      overPhoto={false}
      onClose={leave}
      testID="screen-onboarding-invite-ticket"
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.color.ground }}
        contentContainerStyle={{
          paddingTop: insets.top + 62,
          paddingHorizontal: theme.space.gutter,
          paddingBottom: theme.space.gap16,
          gap: theme.space.gap16,
        }}
      >
        {model.inviterFirstName !== null ? (
          <Card padded={false} style={{ padding: 10, paddingEnd: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap10 }}>
              <Avatar
                name={inviter}
                color={memberAccent(theme, model.members[0]?.colour ?? null)}
                size={36}
              />
              <Text variant="rowTitle" style={{ flex: 1 }}>
                {t({
                  id: 'onboarding.invite.ticket.saved',
                  message: `${inviter} saved you a seat`,
                })}
              </Text>
            </View>
          </Card>
        ) : null}
        {!entry.ready ? (
          <View testID="invite-ticket-loading" style={{ gap: theme.space.gap12 }}>
            <Skeleton height={36} width="70%" />
            <Skeleton height={300} radius={theme.radius.cardLarge} />
          </View>
        ) : (
          <>
            <Text variant="largeTitle" accessibilityRole="header">
              {headline(model)}
            </Text>
            <CrewTicket
              crew={model.crewName ?? ''}
              code={entry.code}
              placeCode={placeCode(model.place, locale)}
              place={model.place}
              dateTag={facts.dates}
              guide={tokek}
              facts={[
                {
                  label: t({ id: 'onboarding.invite.ticket.dates', message: 'Dates' }),
                  value: facts.dates,
                },
                {
                  label: t({ id: 'onboarding.invite.ticket.seat', message: 'Seat' }),
                  value: facts.seat,
                },
                {
                  label: t({ id: 'onboarding.invite.ticket.each', message: 'Each' }),
                  value: facts.each,
                },
              ]}
              testID="invite-ticket"
            />
            {members.length > 0 || model.waiting > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap12 }}>
                <CrewStack members={members} accessibilityLabel={facts.members} size={30} />
                <Text variant="label" tone="muted" style={{ flex: 1, fontWeight: '400' }}>
                  {facts.members}
                </Text>
              </View>
            ) : null}
            {full ? <FullTripPanel model={model} /> : null}
          </>
        )}
      </ScrollView>
      {entry.ready && entry.seatOpen ? (
        <View
          style={{
            backgroundColor: theme.color.ground,
            paddingHorizontal: theme.space.titleGutter,
            paddingTop: theme.space.gap8,
            paddingBottom: Math.max(insets.bottom, 16) + 18,
            gap: theme.space.gap10,
          }}
        >
          <Button
            label={
              full
                ? t({ id: 'onboarding.invite.ticket.waitlist', message: 'Join the waitlist' })
                : t({ id: 'onboarding.invite.ticket.take', message: 'Take the seat' })
            }
            onPress={entry.take}
            loading={entry.busy}
            testID="invite-take-seat"
          />
          <View style={{ alignItems: 'center' }}>
            <TextButton
              align="center"
              label={t({
                id: 'onboarding.invite.ticket.lookAround',
                message: 'Just look around first',
              })}
              onPress={leave}
              testID="invite-look-around"
            />
          </View>
        </View>
      ) : null}
    </FullScreen>
  );
}
