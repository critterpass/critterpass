/**
 * You › Invite friends (undesigned; from the page, stamp and list patterns): the caller's referral
 * link with copy and share, five stamp slots with the Navy and Collector covers they unlock, the
 * friends they brought in by status only (pending, joined, stamped; never what they did), how it
 * works, and the programme terms.
 */
import { t } from '@lingui/core/macro';
import { useContext, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { coversUnlocked, REFERRAL_COVERS, REFERRAL_STAMP_SLOTS } from '@cp/domain';
import { upper } from '@cp/i18n';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { rowId } from '../crews-sheet/crew-commands';
import { useCrewServices } from '../crews-sheet/crew-services';
import { useSessionUid } from '@/data/powersync/use-session-uid';
import { MINT_REFERRAL_CODE, useReferrals, type FriendStatus } from './referral-data';
import { REFERRAL_TERMS_URL } from './terms';

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.space['20'],
    gap: th.space['20'],
    paddingBottom: th.space['32'],
  },
  slots: { flexDirection: 'row', gap: th.space['8'] },
  slot: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: th.radius.md,
    borderWidth: 2,
    borderColor: th.semantic.border.decorative,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: {
    borderStyle: 'solid',
    borderColor: th.semantic.action.primary,
    backgroundColor: th.semantic.action.primary,
  },
}));

function statusLabel(status: FriendStatus): string {
  const labels: Readonly<Record<FriendStatus, string>> = {
    pending: t({ id: 'crew.referral.pending', message: 'Pending' }),
    joined: t({ id: 'crew.referral.joined', message: 'Joined' }),
    stamped: t({ id: 'crew.referral.stamped', message: 'Stamped' }),
  };
  return labels[status];
}

export function ReferralScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const services = useCrewServices();
  const localFirst = useContext(LocalFirstContext);
  const uid = useSessionUid();
  const snapshot = useReferrals(localFirst?.db ?? null, uid);
  const [minted, setMinted] = useState<string | null>(null);
  const asked = useRef(false);
  const code = snapshot.code ?? minted;

  useEffect(() => {
    if (localFirst === null || uid === null || asked.current) return;
    if (!snapshot.loaded || snapshot.code !== null) return;
    asked.current = true;
    void localFirst.commands.send(MINT_REFERRAL_CODE, {}).then((sent) => {
      const value =
        sent.kind === 'applied' ? (sent.result as { code?: unknown } | null)?.code : undefined;
      if (typeof value === 'string') setMinted(value);
    });
  }, [localFirst, uid, snapshot.loaded, snapshot.code]);

  const url = code === null ? null : services.referralUrl(code);
  const covers = coversUnlocked(snapshot.stamps);
  const stamps = snapshot.stamps;
  const shown = Math.min(stamps, REFERRAL_STAMP_SLOTS);
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="referral-dashboard">
      <ScrollView contentContainerStyle={styles.content}>
        <BackEyebrow label={t({ id: 'crew.referral.back', message: 'You' })} />
        <Text variant="displayHero" accessibilityRole="header">
          {upper(t({ id: 'crew.referral.title', message: 'Invite friends' }), locale)}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'crew.referral.body',
            message: 'Each friend who joins and plans with a crew stamps both your passes.',
          })}
        </Text>
        {url === null ? (
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            testID="referral-link-pending"
          >
            {t({
              id: 'crew.referral.linkPending',
              message: 'Your link appears once you’re online and your pass is saved.',
            })}
          </Text>
        ) : (
          <>
            <Text variant="monoData" testID="referral-link">
              {url}
            </Text>
            <PillButton
              label={t({ id: 'crew.referral.share', message: 'Share my link' })}
              onPress={() =>
                void services.share(
                  t({
                    id: 'crew.referral.shareMessage',
                    message: `Plan trips with me on CritterPass: ${url}`,
                  }),
                )
              }
              block
              testID="referral-share"
            />
            <InlineAction
              label={t({ id: 'crew.referral.copy', message: 'Copy link' })}
              onPress={() =>
                void services.copy(url).then(() =>
                  toast.show({
                    id: rowId('referral-copied', url),
                    title: t({ id: 'crew.referral.copied', message: 'Link copied' }),
                  }),
                )
              }
              testID="referral-copy"
            />
          </>
        )}
        <Text variant="eyebrow">
          {upper(
            t({ id: 'crew.referral.stamps', message: `Referral stamps · ${shown} of 5` }),
            locale,
          )}
        </Text>
        <View style={styles.slots} testID="referral-slots">
          {Array.from({ length: REFERRAL_STAMP_SLOTS }, (_, index) => (
            <View
              key={index}
              style={[styles.slot, index < stamps ? styles.filled : null]}
              testID={index < stamps ? 'referral-slot-filled' : 'referral-slot-empty'}
            />
          ))}
        </View>
        {stamps > REFERRAL_STAMP_SLOTS ? (
          <Text variant="bodySm">
            {t({
              id: 'crew.referral.beyond',
              message: `${stamps} stamps so far. Every one still counts.`,
            })}
          </Text>
        ) : null}
        <SettingsGroup
          title={t({ id: 'crew.referral.covers', message: 'Covers' })}
          rows={REFERRAL_COVERS.map((entry) => ({
            key: entry.cover,
            kind: 'check',
            checked: covers.includes(entry.cover),
            title:
              entry.cover === 'navy'
                ? t({ id: 'crew.referral.navy', message: 'Navy cover' })
                : t({ id: 'crew.referral.collector', message: 'Collector cover' }),
            subtitle: t({ id: 'crew.referral.at', message: `At ${entry.stamps} stamps` }),
          }))}
          testID="referral-covers"
        />
        <SettingsGroup
          title={t({ id: 'crew.referral.friends', message: 'Friends' })}
          rows={
            snapshot.friends.length === 0
              ? [
                  {
                    key: 'none',
                    kind: 'custom',
                    title: t({ id: 'crew.referral.noFriends', message: 'No one yet' }),
                    trailing: null,
                  },
                ]
              : snapshot.friends.map((friend) => ({
                  key: friend.id,
                  kind: 'custom',
                  title: friend.name ?? t({ id: 'crew.referral.aFriend', message: 'A friend' }),
                  trailing: (
                    <Text variant="label">{upper(statusLabel(friend.status), locale)}</Text>
                  ),
                }))
          }
          testID="referral-friends"
        />
        <Text variant="h3">{t({ id: 'crew.referral.howTitle', message: 'How it works' })}</Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'crew.referral.how',
            message:
              'Send your link. When a friend makes their pass through it, then joins a crew and votes, or starts a trip, you each get a referral stamp. Three stamps unlock the Navy cover, five the Collector cover.',
          })}
        </Text>
        <InlineAction
          label={t({ id: 'crew.referral.terms', message: 'Referral terms' })}
          onPress={() => void services.openUrl(REFERRAL_TERMS_URL)}
          testID="referral-terms"
        />
      </ScrollView>
    </Scaffold>
  );
}
