/**
 * 3g-3 "Your crews": every crew with its members, a status line from its next trip and the badge
 * slot (crew chat registers unread counts there); the active crew outlined. Tapping a crew makes
 * it the active one and closes the sheet, so Home switches to it. In-app invites answer JOIN or
 * LATER (kept under "Later" until they expire); JOIN WITH A CODE and START A CREW lead on.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useContext, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { PillButton } from '@/ui/buttons/PillButton';
import { CrewCard } from '@/ui/cards/CrewCard';
import { DashedAddCard } from '@/ui/cards/DashedAddCard';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, sizeToken, useTheme } from '@/ui/theme';

import { WaitlistCards } from '../waitlist/WaitlistCards';
import { crewCardBadge } from './badge-slot';
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
import { CREW_ROUTES } from './routes';

/** The sheet's ✕ sits over the top end corner; the header's action starts below it. */
const CLOSE_CLEARANCE = sizeToken(tokens.size.headerPill, 'height');
const CARD_RING = 2;

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], gap: th.space['12'], paddingBottom: th.space['32'] },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: th.space['12'],
    paddingBottom: th.space['4'],
  },
  title: { flex: 1, minWidth: 0 },
  headAction: { paddingTop: CLOSE_CLEARANCE },
  // Crew cards sit on the sheet's raised surface: a sunken fill and a decorative ring set each one
  // apart, and the active crew swaps the ring for the selection yellow (design-system §1.6).
  card: {
    borderWidth: CARD_RING,
    borderColor: th.semantic.border.decorative,
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.sunken,
    overflow: 'hidden',
  },
  active: { borderColor: th.semantic.action.primary },
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
    return t({ id: 'crew.sheet.inDays', message: `${place} in ${days} days` });
  return t({ id: 'crew.sheet.planning', message: `${place} · planning` });
}

export function useSessionUid(): string | null {
  const services = useCrewServices();
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    void services.uid().then(setUid, () => undefined);
  }, [services]);
  return uid;
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
        {t({ id: 'crew.sheet.invitedBy', message: `${inviter} invited you` })}
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
  const Badge = crewCardBadge();

  const pick = (crewId: string) => {
    if (localFirst === null) return;
    void localFirst.commands.send(SET_ACTIVE_CREW, { crew_id: crewId });
    router.back();
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
      accessibilityLabel={t({ id: 'crew.sheet.title', message: 'Your crews' })}
      testID="crews-sheet"
    >
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head} testID="crews-sheet-head">
          <Text variant="h1" accessibilityRole="header" style={styles.title}>
            {upper(t({ id: 'crew.sheet.title', message: 'Your crews' }), locale)}
          </Text>
          <View style={styles.headAction}>
            <PillButton
              size="sm"
              variant="secondary"
              label={t({ id: 'crew.sheet.joinCode', message: 'Join with a code' })}
              onPress={() => router.push(CREW_ROUTES.joinCode)}
              testID="crews-join-code"
            />
          </View>
        </View>
        <WaitlistCards
          db={localFirst?.db ?? null}
          uid={uid}
          commands={localFirst?.commands ?? null}
          now={now}
        />
        {crews.map((card) => (
          <View
            key={card.id}
            style={[styles.card, card.active ? styles.active : null]}
            testID={`crew-card-${card.id}`}
          >
            <CrewCard
              tone="sunken"
              name={card.name}
              detail={statusLine(card, locale, now)}
              members={
                <AvatarStack
                  members={card.members.map((m, index) => ({
                    key: `${index}`,
                    name: m.name,
                    joinIndex: index,
                  }))}
                  max={6}
                  size="sm"
                />
              }
              membersLabel={t({
                id: 'crew.sheet.members',
                message: `${card.members.length} members`,
              })}
              status={Badge === null ? undefined : <Badge crewId={card.id} />}
              onPress={() => pick(card.id)}
            />
          </View>
        ))}
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
        <DashedAddCard
          label={t({ id: 'crew.sheet.start', message: 'Start a crew' })}
          onPress={() => router.push(CREW_ROUTES.newCrew)}
          testID="crews-start"
        />
      </ScrollView>
    </Sheet>
  );
}
