/**
 * 2.17 an invite that ran out (and its siblings: taken back, used up, a trip that is over): the
 * ticket greyed under a pink stamp, what happened in one line, and three ways in: ask whoever
 * shared it for a new code (they get a one-tap fresh invite), use a different code, or start your
 * own crew. "Look around first" leaves without a crew.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  Icon,
  ListCard,
  RectStamp,
  Row,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { inviteProblemCopy, type InviteProblemKind } from '../../invited/invite-problem-copy';
import { INVITED_ROUTES, withoutSeatRoute } from '../../invited/routes';
import type { TicketModel } from '../../invited/ticket-model';
import { useFreshInvite } from '../../invited/use-fresh-invite';
import { CrewTicket } from '../components/CrewTicket';
import { memberAccent } from '../components/member-colour';
import { OptionTile } from '../components/OptionTile';

export type RanOutKind = Extract<
  InviteProblemKind,
  'expired' | 'revoked' | 'used_up' | 'trip_closed'
>;

export function isRanOut(kind: InviteProblemKind | null): kind is RanOutKind {
  return kind === 'expired' || kind === 'revoked' || kind === 'used_up' || kind === 'trip_closed';
}

function stampWord(kind: RanOutKind): string {
  switch (kind) {
    case 'expired':
      return t({ id: 'onboarding.premium.ranOut.expired', message: 'Expired' });
    case 'revoked':
      return t({ id: 'onboarding.premium.ranOut.revoked', message: 'Cancelled' });
    case 'used_up':
      return t({ id: 'onboarding.premium.ranOut.usedUp', message: 'Used up' });
    case 'trip_closed':
      return t({ id: 'onboarding.premium.ranOut.closed', message: 'Closed' });
  }
}

export function InviteRanOut({
  kind,
  model,
  code,
}: {
  readonly kind: RanOutKind;
  readonly model: TicketModel;
  readonly code: string | null;
}) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const copy = inviteProblemCopy(kind, model.inviterFirstName, model.crewName);
  const fresh = useFreshInvite(code);
  const inviter = model.inviterFirstName;
  const askTitle =
    inviter === null
      ? t({ id: 'onboarding.premium.ranOut.askSomeone', message: 'Ask for a new code' })
      : t({ id: 'onboarding.premium.ranOut.ask', message: `Ask ${inviter} for a new code` });
  const askSub =
    fresh.state === 'sent'
      ? t({ id: 'onboarding.premium.ranOut.asked', message: 'Asked. You’ll get the new link.' })
      : fresh.state === 'already'
        ? t({ id: 'onboarding.premium.ranOut.already', message: 'Already asked today.' })
        : fresh.state === 'failed'
          ? t({ id: 'onboarding.premium.ranOut.failed', message: 'That didn’t send. Try again.' })
          : t({
              id: 'onboarding.premium.ranOut.askSub',
              message: 'They get a one-tap “Send new invite”',
            });
  const leave = () => router.replace(withoutSeatRoute());
  return (
    <FullScreen
      closeLabel={t({ id: 'common.sheet.close', message: 'Close' })}
      overPhoto={false}
      onClose={leave}
      testID={`invite-problem-${kind}`}
    >
      <ScrollView
        style={{ backgroundColor: theme.color.ground }}
        contentContainerStyle={{
          paddingTop: insets.top + 70,
          paddingHorizontal: theme.space.gutter,
          paddingBottom: Math.max(insets.bottom, 16) + 16,
          gap: theme.space.gap16,
        }}
      >
        <View style={{ paddingHorizontal: 16 }}>
          <CrewTicket
            crew={model.crewName ?? ''}
            placeCode={code ?? ''}
            place={model.place}
            facts={[]}
            faded
            overlay={
              <View style={{ position: 'absolute', right: 20, top: 58 }}>
                <RectStamp word={stampWord(kind)} ink="pink" rotate={-14} />
              </View>
            }
          />
        </View>
        <View style={{ gap: theme.space.gap8, alignItems: 'center' }}>
          <Text variant="emptyTitle" align="center" accessibilityRole="header">
            {copy.title}
          </Text>
          <Text variant="body" tone="muted" align="center">
            {copy.line}
          </Text>
        </View>
        <ListCard>
          {fresh.canAsk ? (
            <Row
              title={askTitle}
              subtitle={askSub}
              leading={
                <OptionTile bg={theme.color.status.voteOpen.bg}>
                  <Avatar
                    name={inviter ?? '?'}
                    color={memberAccent(theme, model.members[0]?.colour ?? null)}
                    size={32}
                  />
                </OptionTile>
              }
              onPress={fresh.state === 'sent' || fresh.state === 'already' ? undefined : fresh.ask}
              testID="invite-ask-fresh"
            />
          ) : null}
          <Row
            title={t({
              id: 'onboarding.premium.ranOut.otherCode',
              message: 'Use a different code',
            })}
            subtitle={t({ id: 'onboarding.premium.ranOut.otherCodeSub', message: 'Type it in' })}
            leading={
              <OptionTile bg={theme.color.status.rain.bg}>
                <Icon name="edit" size={18} color={theme.color.status.rain.text} />
              </OptionTile>
            }
            trailing={<Icon name="forward" size={16} color={theme.color.placeholder} />}
            onPress={() => router.replace(INVITED_ROUTES.code)}
            testID="invite-other-code"
          />
          <Row
            title={t({ id: 'onboarding.premium.ranOut.ownCrew', message: 'Start your own crew' })}
            subtitle={t({
              id: 'onboarding.premium.ranOut.ownCrewSub',
              message: 'Plan a trip of your own',
            })}
            leading={
              <OptionTile bg={theme.color.status.booked.bg}>
                <Icon name="plus" size={18} color={theme.color.status.booked.text} />
              </OptionTile>
            }
            trailing={<Icon name="forward" size={16} color={theme.color.placeholder} />}
            onPress={leave}
            testID="invite-own-crew"
          />
        </ListCard>
        <View style={{ alignItems: 'center' }}>
          <TextButton
            align="center"
            label={t({ id: 'onboarding.premium.ranOut.lookAround', message: 'Look around first' })}
            onPress={leave}
            testID="invite-look-around"
          />
        </View>
      </ScrollView>
    </FullScreen>
  );
}
