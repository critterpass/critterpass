/**
 * 3g-3 "Your crews": every crew with its members, a status line from its next trip and the badge
 * slot (crew chat registers unread counts there); the active crew outlined. Tapping a crew makes
 * it the active one and closes the sheet, so Home switches to it. In-app invites answer JOIN or
 * LATER (kept under "Later" until they expire); JOIN WITH A CODE and START A CREW lead on.
 */
import { plural, t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useContext, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { upper } from '@cp/i18n';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSessionUid } from '@/data/powersync/use-session-uid';
import { goBackOr } from '@/lib/navigation/back';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { PillButton } from '@/ui/buttons/PillButton';
import { Sheet } from '@/ui/sheet/Sheet';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { WaitlistCards } from '../waitlist/WaitlistCards';
import { CrewSheetCard, StartCrewCard } from './crew-sheet-cards';
import { ACCEPT_INVITE, DEFER_INVITE, rowId, SET_ACTIVE_CREW } from './crew-commands';
import { useCrews } from './crew-data';
import { useCrewServices } from './crew-services';
import {
  crewCards,
  daysUntil,
  inviteCards,
  type CrewCardView,
  type InviteCardView,
} from './crew-view';
import { CREW_ROUTES, crewInviteRoute, crewSettingsRoute } from './routes';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], gap: th.space['12'], paddingBottom: th.space['32'] },
  invite: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
    borderRadius: th.radius.lg,
    padding: th.space['16'],
    gap: th.space['12'],
  },
  actions: { flexDirection: 'row', gap: th.space['8'] },
}));

function statusLine(card: CrewCardView, locale: string, now: Date): string {
  const trip = card.nextTrip;
  if (trip === null) return t({ id: 'crew.sheet.nothingPlanned', message: 'Nothing planned yet' });
  const place = trip.place ?? t({ id: 'crew.sheet.somewhere', message: 'A trip' });
  const days = daysUntil(trip.start_date, now);
  if (days !== null && days > 0)
    return t({
      id: 'crew.sheet.inDays',
      message: plural(days, { one: `${place} in # day`, other: `${place} in # days` }),
    });
  return t({ id: 'crew.sheet.planning', message: `${place} · planning` });
}

function InviteCard({
  invite,
  joined,
  onJoin,
  onLater,
}: {
  invite: InviteCardView;
  joined: boolean;
  onJoin: () => void;
  onLater: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const inviter = invite.inviterName;
  return (
    <View style={styles.invite} testID={`crew-invite-${invite.id}`}>
      <Text variant="h3">{invite.crewName}</Text>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {inviter === ''
          ? t({ id: 'crew.sheet.invited', message: 'You’re invited' })
          : t({ id: 'crew.sheet.invitedBy', message: `${inviter} invited you` })}
      </Text>
      <View style={styles.actions}>
        <PillButton
          size="sm"
          label={
            joined
              ? t({ id: 'crew.sheet.joined', message: 'Joined ✓' })
              : t({ id: 'crew.sheet.join', message: 'Join' })
          }
          onPress={onJoin}
          disabled={joined}
          testID={`crew-invite-join-${invite.id}`}
        />
        {invite.later || joined ? null : (
          <PillButton
            size="sm"
            variant="secondary"
            label={t({ id: 'crew.sheet.later', message: 'Later' })}
            onPress={onLater}
            testID={`crew-invite-later-${invite.id}`}
          />
        )}
      </View>
    </View>
  );
}

export function CrewsSheet() {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const localFirst = useContext(LocalFirstContext);
  const uid = useSessionUid();
  const snapshot = useCrews(localFirst?.db ?? null, uid);
  const [joined, setJoined] = useState<ReadonlySet<string>>(new Set());
  const now = new Date();
  const crews = crewCards(snapshot);
  const invites = inviteCards(snapshot, now);

  const pick = (crewId: string) => {
    if (localFirst === null) return;
    void localFirst.commands.send(SET_ACTIVE_CREW, { crew_id: crewId });
    goBackOr(CREW_ROUTES.home);
  };
  const join = (invite: InviteCardView) => {
    if (localFirst === null) return;
    void localFirst.commands.send(ACCEPT_INVITE, { invite_id: invite.id }).then((sent) => {
      if (sent.kind !== 'applied') {
        toast.show({
          id: rowId('crew-join-failed', invite.id),
          title: t({ id: 'crew.sheet.joinFailed', message: 'That invite can’t be joined now' }),
        });
        return;
      }
      setJoined((prev) => new Set([...prev, invite.id]));
      const crewName = invite.crewName;
      toast.show({
        id: rowId('crew-joined', invite.id),
        title: t({ id: 'crew.sheet.joinedToast', message: `You’re in ${crewName}` }),
      });
    });
  };
  const later = (invite: InviteCardView) => {
    if (localFirst === null) return;
    void localFirst.commands.send(DEFER_INVITE, { invite_id: invite.id });
  };

  const open = invites.filter((invite) => !invite.later);
  const parked = invites.filter((invite) => invite.later);
  return (
    <Sheet
      detents={['large']}
      title={upper(t({ id: 'crew.sheet.title', message: 'Your crews' }), locale)}
      headerEnd={
        <PillButton
          size="sm"
          variant="secondary"
          label={t({ id: 'crew.sheet.joinCode', message: 'Join with a code' })}
          onPress={() => router.push(CREW_ROUTES.joinCode)}
          testID="crews-join-code"
        />
      }
      closable={false}
      accessibilityLabel={t({ id: 'crew.sheet.title', message: 'Your crews' })}
      testID="crews-sheet"
    >
      <ScrollView contentContainerStyle={styles.body}>
        <WaitlistCards
          db={localFirst?.db ?? null}
          uid={uid}
          commands={localFirst?.commands ?? null}
          now={now}
        />
        {crews.map((card) => (
          <CrewSheetCard
            key={card.id}
            crewId={card.id}
            name={card.name}
            detail={statusLine(card, locale, now)}
            members={card.members}
            active={card.active}
            onPress={() => pick(card.id)}
            onSettings={() => router.push(crewSettingsRoute(card.id))}
            onInvite={() => router.push(crewInviteRoute(card.id))}
          />
        ))}
        {/* Until the first read answers, the crews are not "none": a placeholder holds their place. */}
        {snapshot.loaded ? null : <Skeleton preset="card" testID="crews-loading" />}
        {open.map((invite) => (
          <InviteCard
            key={invite.id}
            invite={invite}
            joined={joined.has(invite.id)}
            onJoin={() => join(invite)}
            onLater={() => later(invite)}
          />
        ))}
        {parked.length > 0 ? (
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {upper(t({ id: 'crew.sheet.laterSection', message: 'Later' }), locale)}
          </Text>
        ) : null}
        {parked.map((invite) => (
          <InviteCard
            key={invite.id}
            invite={invite}
            joined={joined.has(invite.id)}
            onJoin={() => join(invite)}
            onLater={() => later(invite)}
          />
        ))}
        <StartCrewCard onPress={() => router.push(CREW_ROUTES.newCrew)} />
      </ScrollView>
    </Sheet>
  );
}
