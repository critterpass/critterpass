/**
 * Delete account (9.09) on one page: what goes and what the crew keeps as two stickered cards,
 * money you're owed with Settle up, the store's billing note, then the hold to delete (the shell's
 * one irreversible confirm; screen readers get the two-choice alert). Offline, the hold is off and
 * says why. Once closed, the closing page takes over with no way back.
 */
import { useLingui } from '@lingui/react/macro';
import { Stack } from 'expo-router';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Button, Card, Icon, ListCard, Row, Tag, Text, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { AccountServices } from '../../account/account-services';
import { useDeleteAccount } from '../../account/use-delete-account';
import { amountText } from '../../account/amount-text';
import { ClosedPremiumView } from '../closed/closed-premium-view';
import { DeleteHoldRing } from './delete-hold-ring';
import { PreflightNotes } from './preflight-notes';

export function DeletePremiumScreen({
  services,
}: {
  /** The account's reads and the phone wipe; the device's own by default. */
  readonly services?: AccountServices;
} = {}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const d = useDeleteAccount(services);

  if (d.closed !== null) {
    return (
      <>
        <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />
        <ClosedPremiumView
          mode={d.closed.purgeAt === null ? 'erased' : 'closed'}
          purgeAt={d.closed.purgeAt}
          closedOn={new Date()}
          busy={d.busy}
          problem={d.clearProblem}
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a command value, never copy.
          onKeep={() => d.clear('sign_in')}
          onClose={() => d.clear()}
        />
      </>
    );
  }

  const owed = (d.preflight?.balances ?? []).filter((b) => b.net_minor > 0);
  const source = d.preflight?.subscription?.source ?? null;
  const billing =
    source === 'app_store'
      ? t({
          id: 'you.delete.billedAppStore',
          message:
            'Pass+ is billed by the App Store. Deleting doesn’t cancel it, so cancel it there too.',
        })
      : source === 'play'
        ? t({
            id: 'you.delete.billedPlay',
            message:
              'Pass+ is billed by Google Play. Deleting doesn’t cancel it, so cancel it there too.',
          })
        : d.passPlus
          ? t({
              id: 'you.delete.passPlus',
              message:
                'Pass+ is billed by the store you bought it from. Deleting doesn’t cancel it, so cancel it there too.',
            })
          : null;
  const closes = d.preflight?.instant
    ? t({
        id: 'you.delete.closesInstant',
        message: 'This pass isn’t saved, so it’s erased right away. There’s no way back to it.',
      })
    : t({
        id: 'you.delete.closesLine',
        message:
          'Your account is closed now and erased after 30 days. Sign in before then and everything comes back.',
      });

  return (
    <PushScreen
      largeTitle
      title={t({ id: 'you.delete.title', message: 'Delete your account?' })}
      backLabel={t({ id: 'you.delete.back', message: 'Settings' })}
      testID="you-delete"
    >
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap10 }}>
        <Text variant="body" tone="muted">
          {t({
            id: 'you.delete.lede',
            message: 'Here’s what goes with you, and what the crew keeps.',
          })}
        </Text>
        {/* What goes and what stays, side by side (9.09). */}
        <View style={{ flexDirection: 'row', gap: th.space.gap10 }}>
          <Card padded style={{ flex: 1 }}>
            <Tag
              label={t({ id: 'you.delete.goes', message: 'Goes' })}
              color={th.accent.pink}
              rotate={-3}
            />
            <Text variant="note" tone="inkSecondary" style={{ marginTop: 8 }}>
              {t({
                id: 'you.delete.goes.pass',
                message: 'Your pass, your critters and your stamps',
              })}
              {'\n\n'}
              {t({
                id: 'you.delete.goes.profile',
                message: 'Your profile, uploads and chat messages',
              })}
            </Text>
          </Card>
          <Card padded style={{ flex: 1 }}>
            <Tag
              label={t({ id: 'you.delete.keeps', message: 'The crew keeps' })}
              color={th.accent.mint}
              rotate={3}
            />
            <Text variant="note" tone="inkSecondary" style={{ marginTop: 8 }}>
              {t({
                id: 'you.delete.keeps.plans',
                message: 'Plans you helped make, shown as “former member”',
              })}
              {'\n\n'}
              {t({
                id: 'you.delete.keeps.expenses',
                message: 'Expenses you added, so Balances still add up',
              })}
            </Text>
          </Card>
        </View>
        {owed.map((balance) => (
          <View
            key={`${balance.crew_id}-${balance.currency}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderRadius: th.radius.card,
              paddingVertical: 12,
              paddingHorizontal: 14,
              backgroundColor: th.color.banner.guide.bg,
            }}
            testID={`you-delete-owed-${balance.crew_id}`}
          >
            <View style={{ flex: 1 }}>
              <Text variant="headline" color={th.color.banner.guide.text}>
                {t({
                  id: 'you.premium.owed',
                  message: `You’re owed ${amountText(balance.net_minor, balance.currency, locale)}`,
                })}
              </Text>
              <Text variant="captionMuted" color={th.color.banner.guide.text}>
                {t({
                  id: 'you.premium.delete.owedLine',
                  message: `Settle up first, or ${balance.crew_name} keep it.`,
                })}
              </Text>
            </View>
            <Button
              alignSelf="auto"
              label={t({ id: 'you.premium.settleUp', message: 'Settle up' })}
              size="small"
              onPress={d.onSettle}
              testID="you-delete-settle"
            />
          </View>
        ))}
        {d.preflight === null ? null : <PreflightNotes preflight={d.preflight} />}
        {billing === null ? null : (
          <Text variant="caption" tone="muted" testID="you-delete-pass-plus">
            {billing}{' '}
            {source === 'app_store' || source === 'play' ? (
              <Text
                variant="caption"
                tone="ink"
                accessibilityRole="link"
                onPress={d.onManageSubscription}
                testID="you-delete-manage-subscription"
              >
                {t({ id: 'you.delete.manageSubscription', message: 'Manage subscription ›' })}
              </Text>
            ) : null}
          </Text>
        )}
        <View style={{ marginTop: th.space.gap16, gap: th.space.gap10 }}>
          <DeleteHoldRing
            label={
              d.busy
                ? t({ id: 'you.delete.closing', message: 'Closing your account…' })
                : t({ id: 'you.delete.holdTitle', message: 'Hold to delete' })
            }
            onConfirm={d.onDelete}
            disabled={!d.online || d.busy}
            fallback={{
              title: t({ id: 'you.delete.title', message: 'Delete your account?' }),
              message: closes,
              confirm: t({ id: 'you.delete.holdAction', message: 'Delete my account' }),
              cancel: t({ id: 'you.delete.keep', message: 'Keep my account' }),
            }}
            testID="you-delete-hold"
          />
          {!d.online ? (
            <Text variant="caption" color={th.color.destructive.helper} testID="you-delete-offline">
              {t({
                id: 'you.delete.offline',
                message: 'You’re offline. Deleting needs a connection.',
              })}
            </Text>
          ) : null}
          {d.failed ? (
            <Text variant="caption" color={th.color.destructive.helper} testID="you-delete-problem">
              {t({
                id: 'you.delete.notClosed',
                message:
                  'We couldn’t close your account, so nothing was changed on this phone. Try again in a moment.',
              })}
            </Text>
          ) : null}
          <Text variant="captionMuted" tone="muted" align="center" textBreakStrategy="balanced">
            {closes}
          </Text>
          {/* The two ways out of here read as actions: the download as a row, keeping as a pill. */}
          <ListCard>
            <Row
              title={t({ id: 'you.delete.downloadFirst', message: 'Download my data first' })}
              subtitle={d.download.line}
              leading={<Icon name="download" size={20} color={th.color.ink} />}
              trailing={<Icon name="forward" size={16} color={th.color.muted} />}
              onPress={d.download.onPress}
              testID="you-delete-download"
            />
          </ListCard>
          <Button
            variant="secondary"
            label={t({ id: 'you.delete.keep', message: 'Keep my account' })}
            onPress={d.onKeep}
            testID="you-delete-keep"
          />
        </View>
      </View>
    </PushScreen>
  );
}
