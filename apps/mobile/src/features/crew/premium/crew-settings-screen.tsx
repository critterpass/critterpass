/**
 * Crew settings (3.12) as a push: the crest in its cover colour, members as a grid (ORG marked, tap
 * for their sheet), trips still going, the code (Share opens the invite sheet; hold for a new one),
 * notification level, chat-after-leaving, then Leave (the organiser hands over first). Removal has
 * a 10 s Undo; members see no management controls.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and CSS shadows, never copy. */
import { t } from '@lingui/core/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useContext, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DEFAULT_CREW_NOTIFY_LEVEL, isCrewNotifyLevel, type CrewNotifyLevel } from '@cp/domain';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Card,
  CritterSticker,
  ListCard,
  PressableScale,
  Row,
  SegmentedControl,
  StatusTag,
  Text,
  Toggle,
  usePremiumTheme,
  useToast,
} from '@/ui/premium';
import { confirmAlert, PushScreen } from '@/ui/premium/shell';
import { guideSticker } from '@/ui/premium/stickers/guides';

import {
  LEAVE_CREW,
  REMOVE_MEMBER,
  ROTATE_JOIN_CODE,
  SET_CREW_NOTIFY,
} from '../crews-sheet/crew-commands';
import { useCrewServices } from '../crews-sheet/crew-services';
import { crewEditRoute, crewInviteRoute, crewLeaveRoute } from '../crews-sheet/routes';
import { onRemovalRequest, useUndoableRemoval } from '../members/undoable-removal';
import { returnHome } from '../start-crew/return-home';
import { useCrewDetail } from '../settings/use-crew-detail';
import { firstName, tripDatesLine, tripStatusWord } from './crew-copy';
import { CREST_SHAPE, crewCoverOf, passInk } from './crew-look';
import { MemberGrid } from './components/member-grid';
import { CrewCodeCard } from './components/crew-code-card';
import { CrewMissing } from './crew-missing';

export function CrewSettingsPremium() {
  const th = usePremiumTheme();
  const locale = useLocale();
  const toast = useToast();
  const services = useCrewServices();
  const [minting, setMinting] = useState(false);
  const { crewId = '' } = useLocalSearchParams<{ crewId?: string }>();
  const detail = useCrewDetail(crewId);
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  const [keepChat, setKeepChat] = useState(false);
  const removal = useUndoableRemoval((uid) => {
    void commands?.send(REMOVE_MEMBER, { crew_id: crewId, uid }).then((sent) => {
      if (sent.kind !== 'applied') {
        toast.show({
          kind: 'error',
          message: t({
            id: 'crew.settings.failed',
            message: 'That didn’t go through. Try again with signal.',
          }),
        });
      }
    });
  });

  useEffect(
    () =>
      onRemovalRequest((crew, uid) => {
        if (crew !== crewId) return;
        removal.remove(uid);
        const member = detail.members.find((m) => m.user_id === uid);
        const name = firstName(member?.display_name ?? null);
        toast.show({
          kind: 'done',
          message: t({ id: 'crew.premium.removed', message: `${name} is out of the crew` }),
          undo: () => removal.undo(uid),
        });
      }),
    [crewId, removal, detail.members, toast],
  );

  const back = t({ id: 'crew.settings.backPlain', message: 'Back' });
  if (!detail.loaded || detail.crew === null) {
    return <CrewMissing loading={!detail.loaded} backLabel={back} />;
  }
  const crew = detail.crew;
  const look = passInk(crewCoverOf(crew.cover));
  const sticker = guideSticker(crew.art);
  const members = detail.members.filter((m) => !removal.waiting.includes(m.user_id));
  const notify: CrewNotifyLevel =
    detail.me?.notify_level != null && isCrewNotifyLevel(detail.me.notify_level)
      ? detail.me.notify_level
      : DEFAULT_CREW_NOTIFY_LEVEL;
  const code = detail.code;
  const now = new Date();
  const codeUrl = code === null ? null : services.inviteUrl(code.code);

  // No live code: the organiser makes one here (nothing to invalidate, so no question first).
  const mint = () => {
    if (commands === null || minting) return;
    setMinting(true);
    void commands.send(ROTATE_JOIN_CODE, { crew_id: crewId }).finally(() => setMinting(false));
  };

  const newCode = async () => {
    if (commands === null || !detail.canManage) return;
    const ok = await confirmAlert({
      title: t({ id: 'crew.premium.code.newTitle', message: 'Make a new code?' }),
      message: t({
        id: 'crew.premium.code.newLine',
        message: 'The old code stops working at once.',
      }),
      confirm: t({ id: 'crew.settings.rotate', message: 'New code' }),
      cancel: t({ id: 'crew.premium.cancel', message: 'Cancel' }),
    });
    if (ok) void commands.send(ROTATE_JOIN_CODE, { crew_id: crewId });
  };

  const leave = async () => {
    if (detail.isOrganiser && members.length > 1) {
      router.push(`${crewLeaveRoute(crewId)}?keep=${keepChat ? '1' : '0'}`);
      return;
    }
    const ok = await confirmAlert({
      title: t({ id: 'crew.settings.leaveTitle', message: 'Leave this crew?' }),
      message: t({
        id: 'crew.settings.leaveTrips',
        message: 'You leave its trips; your seat opens for the waitlist.',
      }),
      confirm: t({ id: 'crew.settings.leaveConfirm', message: 'Leave' }),
      cancel: t({ id: 'crew.premium.cancel', message: 'Cancel' }),
    });
    if (!ok || commands === null) return;
    const sent = await commands.send(LEAVE_CREW, { crew_id: crewId, keep_in_chat: keepChat });
    if (sent.kind === 'applied') returnHome();
    else
      toast.show({
        kind: 'error',
        message: t({
          id: 'crew.settings.failed',
          message: 'That didn’t go through. Try again with signal.',
        }),
      });
  };

  return (
    <PushScreen
      title={t({ id: 'crew.premium.settings.title', message: 'Crew' })}
      backLabel={back}
      scroll={false}
      {...(detail.canManage
        ? {
            action: {
              key: 'edit',
              label: t({ id: 'crew.premium.edit', message: 'Edit' }),
              sfSymbol: 'pencil',
              glyph: 'edit' as const,
              text: true,
              onPress: () => router.push(crewEditRoute(crewId)),
              testID: 'crew-settings-edit',
            },
          }
        : {})}
      testID="crew-settings"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingHorizontal: th.space.gutter }]}
      >
        <View style={styles.head}>
          <View
            style={[
              styles.crest,
              { backgroundColor: look.fill, boxShadow: '0 14px 26px -12px rgba(20,22,40,.45)' },
            ]}
          >
            <CritterSticker kind={sticker.kind} seed={sticker.seed} name={sticker.name} size={62} />
          </View>
          <Text variant="title" accessibilityRole="header" testID="crew-settings-name">
            {crew.name}
          </Text>
          <Text variant="body" tone="muted">
            {t({ id: 'crew.premium.settings.count', message: `${members.length} members` })}
          </Text>
        </View>

        <MemberGrid
          crewId={crewId}
          members={members}
          uid={detail.uid}
          canInvite
          onInvite={() => router.push(crewInviteRoute(crewId))}
        />

        {detail.trips.length === 0 ? null : (
          <ListCard>
            {detail.trips.map((trip) => {
              const dates = tripDatesLine(trip, now, locale);
              return (
                <Row
                  key={trip.id}
                  title={
                    trip.place ?? t({ id: 'crew.premium.settings.tripUnnamed', message: 'A trip' })
                  }
                  {...(dates === null ? {} : { subtitle: dates })}
                  trailing={
                    <StatusTag
                      label={tripStatusWord(trip.status)}
                      tone={trip.status === 'in_trip' ? 'booked' : 'voteOpen'}
                    />
                  }
                  onPress={() => router.push(`/hub/${trip.id}`)}
                  testID={`crew-settings-trip-${trip.id}`}
                />
              );
            })}
          </ListCard>
        )}

        <CrewCodeCard
          code={code}
          url={codeUrl}
          canManage={detail.canManage}
          minting={minting}
          now={now}
          onMint={mint}
          onShare={() => router.push(crewInviteRoute(crewId))}
          onNewCode={() => void newCode()}
        />

        <Card padded style={{ gap: th.space.gap12 }}>
          <Text variant="rowText">
            {t({ id: 'crew.settings.notify', message: 'Notifications' })}
          </Text>
          <SegmentedControl
            accessibilityLabel={t({ id: 'crew.settings.notify', message: 'Notifications' })}
            options={[
              {
                value: 'all' as const,
                label: t({ id: 'crew.premium.notify.all', message: 'Everything' }),
              },
              {
                value: 'mentions' as const,
                label: t({ id: 'crew.settings.notifyMentions', message: 'Mentions' }),
              },
              {
                value: 'off' as const,
                label: t({ id: 'crew.premium.notify.off', message: 'Nothing' }),
              },
            ]}
            value={notify}
            onChange={(level) => void commands?.send(SET_CREW_NOTIFY, { crew_id: crewId, level })}
            testID="crew-settings-notify"
          />
          <View style={styles.toggleRow}>
            <Text variant="rowText" style={styles.grow}>
              {t({ id: 'crew.premium.keepChat', message: 'Keep chat if I leave' })}
            </Text>
            <Toggle
              value={keepChat}
              onChange={setKeepChat}
              accessibilityLabel={t({
                id: 'crew.premium.keepChat',
                message: 'Keep chat if I leave',
              })}
              testID="crew-leave-keep-chat"
            />
          </View>
        </Card>

        <PressableScale
          accessibilityRole="button"
          onPress={() => void leave()}
          style={[styles.leave, { backgroundColor: th.color.card, boxShadow: th.shadow.card }]}
          testID="crew-settings-leave"
        >
          <Text variant="headline" color={th.color.destructive.listAction}>
            {t({ id: 'crew.settings.leave', message: 'Leave the crew' })}
          </Text>
        </PressableScale>
        {detail.isOrganiser && members.length > 1 ? (
          <Text variant="caption" tone="muted" align="center">
            {t({
              id: 'crew.premium.settings.handFirst',
              message: 'You run this crew, so you’ll hand it over first.',
            })}
          </Text>
        ) : null}
      </ScrollView>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 40 },
  head: { alignItems: 'center', gap: 4, paddingTop: 8 },
  crest: CREST_SHAPE,
  grow: { flex: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  leave: { height: 48, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
