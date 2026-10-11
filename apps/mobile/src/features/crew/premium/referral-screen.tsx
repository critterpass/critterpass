/**
 * Invite friends (3.11), from the pass: the referral page as a passport page with a stamp per
 * friend who joined and planned (dashed slots for the rest), the reward track to the Navy (3) and
 * Collector (5) covers, the link with Copy, the friends invited so far, and Share my link. A friend
 * who has not joined yet is "A friend", never named. The terms open from the foot of the page.
 */
import { t } from '@lingui/core/macro';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { REFERRAL_STAMP_SLOTS } from '@cp/domain';

import {
  Avatar,
  Button,
  ListCard,
  PressableScale,
  RoundStamp,
  Row,
  StatusTag,
  Text,
  TextButton,
  usePremiumTheme,
  useToast,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useCrewServices } from '../crews-sheet/crew-services';
import type { ReferredFriend } from '../referral/referral-data';
import { REFERRAL_TERMS_URL } from '../referral/terms';
import { useReferralLink } from '../referral/use-referral-link';
import { firstName } from './crew-copy';
import { COVER_FILL } from './crew-look';

export function ReferralPremium() {
  const th = usePremiumTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const services = useCrewServices();
  const { snapshot, url } = useReferralLink();
  const stamps = snapshot.stamps;
  const stamped = snapshot.friends.filter((f) => f.status === 'stamped');
  const progress = Math.min(stamps, REFERRAL_STAMP_SLOTS) / REFERRAL_STAMP_SLOTS;

  const share = () => {
    if (url !== null) {
      void services.share(
        t({
          id: 'crew.referral.shareMessage',
          message: `Plan trips with me on CritterPass: ${url}`,
        }),
      );
    }
  };

  return (
    <PushScreen
      title={t({ id: 'crew.referral.title', message: 'Invite friends' })}
      backLabel={t({ id: 'crew.referral.back', message: 'You' })}
      scroll={false}
      testID="referral-dashboard"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingHorizontal: th.space.gutter }]}
      >
        <Text variant="body" tone="muted">
          {t({
            id: 'crew.referral.body',
            message: 'Each friend who joins and plans with a crew stamps both your passes.',
          })}
        </Text>
        <View style={[styles.page, { backgroundColor: th.accent.paper }]} testID="referral-slots">
          <View style={styles.pageHead}>
            <Text variant="dayBadgeWeekday" tone="muted" style={styles.mono}>
              {t({ id: 'crew.premium.referral.page', message: 'PAGE 07 · REFERRALS' })}
            </Text>
            <Text variant="dayBadgeWeekday" tone="muted" style={styles.mono}>
              {`${String(Math.min(stamps, REFERRAL_STAMP_SLOTS))} / ${String(REFERRAL_STAMP_SLOTS)}`}
            </Text>
          </View>
          <View style={styles.slots}>
            {Array.from({ length: REFERRAL_STAMP_SLOTS }, (_, i) => {
              const friend = stamped[i];
              return i < stamps ? (
                <RoundStamp
                  key={i}
                  word={
                    friend === undefined
                      ? '★'
                      : firstName(friend.name).slice(0, 8).toLocaleUpperCase()
                  }
                  top={t({ id: 'crew.premium.referral.joined', message: 'JOINED' })}
                  ink={i % 2 === 0 ? 'pink' : 'green'}
                  size={64}
                  rotate={i % 2 === 0 ? -14 : 9}
                  testID="referral-slot-filled"
                />
              ) : (
                <View
                  key={i}
                  style={[styles.emptySlot, { borderColor: th.color.outlineEmpty }]}
                  testID="referral-slot-empty"
                />
              );
            })}
          </View>
          <View style={styles.track}>
            <View style={[styles.rail, { backgroundColor: th.color.control }]}>
              <View
                style={[
                  styles.fill,
                  { width: `${String(progress * 100)}%`, backgroundColor: th.color.ink },
                ]}
              />
            </View>
            <View style={[styles.book, { left: '57%', backgroundColor: COVER_FILL.navy }]} />
            <View style={[styles.book, { right: 0, backgroundColor: COVER_FILL.collector }]} />
          </View>
          <View style={styles.trackLabels}>
            <Text variant="caption" tone="muted">
              {t({ id: 'crew.referral.navy', message: 'Navy cover' })}
            </Text>
            <Text variant="caption" tone="muted">
              {t({ id: 'crew.referral.collector', message: 'Collector cover' })}
            </Text>
          </View>
        </View>

        {url === null ? (
          <Text variant="caption" tone="muted" testID="referral-link-pending">
            {t({
              id: 'crew.referral.linkPending',
              message: 'Your link appears once you’re online and your pass is saved.',
            })}
          </Text>
        ) : (
          <View
            style={[styles.link, { backgroundColor: th.color.card, boxShadow: th.shadow.card }]}
          >
            <Text
              variant="body"
              tone="inkSecondary"
              numberOfLines={1}
              style={styles.grow}
              testID="referral-link"
            >
              {url.replace(/^https?:\/\//u, '')}
            </Text>
            <PressableScale
              accessibilityRole="button"
              onPress={() =>
                void services.copy(url).then(() =>
                  toast.show({
                    kind: 'done',
                    message: t({ id: 'crew.referral.copied', message: 'Link copied' }),
                  }),
                )
              }
              style={[styles.copy, { backgroundColor: th.color.control }]}
              testID="referral-copy"
            >
              <Text variant="buttonSmall">{t({ id: 'crew.premium.copy', message: 'Copy' })}</Text>
            </PressableScale>
          </View>
        )}

        {snapshot.friends.length === 0 ? null : (
          <>
            <Text variant="label" tone="muted">
              {t({ id: 'crew.premium.referral.friends', message: 'Friends you invited' })}
            </Text>
            <ListCard testID="referral-friends">
              {snapshot.friends.map((friend) => (
                <FriendRow key={friend.id} friend={friend} />
              ))}
            </ListCard>
          </>
        )}
        <TextButton
          label={t({ id: 'crew.referral.terms', message: 'Referral terms' })}
          onPress={() => void services.openUrl(REFERRAL_TERMS_URL)}
          testID="referral-terms"
        />
      </ScrollView>
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 12, paddingHorizontal: th.space.titleGutter },
        ]}
      >
        <Button
          label={t({ id: 'crew.referral.share', message: 'Share my link' })}
          icon="share"
          disabled={url === null}
          onPress={share}
          testID="referral-share"
        />
      </View>
    </PushScreen>
  );
}

function FriendRow({ friend }: { readonly friend: ReferredFriend }) {
  const th = usePremiumTheme();
  const named = friend.status !== 'pending';
  const name = named
    ? firstName(friend.name)
    : t({ id: 'crew.premium.referral.aFriend', message: 'A friend' });
  return (
    <Row
      title={name}
      subtitle={
        friend.status === 'stamped'
          ? t({
              id: 'crew.premium.referral.stampedSub',
              message: 'Planned a trip. You both got a stamp.',
            })
          : friend.status === 'joined'
            ? t({
                id: 'crew.premium.referral.joinedSub',
                message: 'Made a pass. A crew trip stamps it.',
              })
            : t({ id: 'crew.premium.referral.pendingSub', message: 'Hasn’t made a pass yet' })
      }
      leading={<Avatar name={name} color={named ? th.accent.sky : th.accent.neutral} size={34} />}
      trailing={
        friend.status === 'pending' ? undefined : (
          <StatusTag
            label={
              friend.status === 'stamped'
                ? t({ id: 'crew.referral.stamped', message: 'Stamped' })
                : t({ id: 'crew.referral.joined', message: 'Joined' })
            }
            tone={friend.status === 'stamped' ? 'booked' : 'rain'}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 24 },
  page: {
    borderRadius: 26,
    padding: 16,
    gap: 14,
    boxShadow:
      'inset 0 0 0 .5px rgba(120,100,60,.15), 0 2px 4px rgba(20,22,40,.05), 0 24px 44px -20px rgba(20,22,40,.3)',
  },
  pageHead: { flexDirection: 'row', justifyContent: 'space-between' },
  mono: { letterSpacing: 1.1 },
  slots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 72,
  },
  emptySlot: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderStyle: 'dashed' },
  track: { height: 40, justifyContent: 'center' },
  rail: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4 },
  book: {
    position: 'absolute',
    width: 30,
    height: 40,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 7,
  },
  trackLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  link: {
    height: 54,
    borderRadius: 27,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 18,
    paddingRight: 6,
    gap: 8,
  },
  grow: { flex: 1 },
  copy: { height: 42, borderRadius: 21, paddingHorizontal: 16, justifyContent: 'center' },
  footer: { paddingTop: 8 },
});
