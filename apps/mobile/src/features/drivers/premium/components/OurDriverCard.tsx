/**
 * One of our drivers as a card, in the drivers look (6.20, 6.24): avatar, name and the days he
 * drove with the crew's verdict, a status tag (Listed, Paused, Not claimed). A pending invite shows
 * its timeline (sent, opened, waiting), when the link switches off, Nudge once and Cancel invite;
 * an ended one says why. Rate him (or change the answer) and Invite to be listed sit at the foot.
 */
import { format } from '@cp/i18n';
import type { OurDriver } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { crewAccent } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { Avatar, Button, Card, StatusTag, Text, usePremiumTheme } from '@/ui/premium';

import { ourDriverState } from '../../ours/timeline';

export interface OurDriverCardProps {
  readonly driver: OurDriver;
  readonly index: number;
  readonly now: Date;
  readonly busy: boolean;
  readonly onRate: () => void;
  readonly onInvite: () => void;
  readonly onNudge: (inviteId: string) => void;
  readonly onCancel: (inviteId: string) => void;
}

export function OurDriverCard({ driver, index, now, busy, ...on }: OurDriverCardProps) {
  const th = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const date = (iso: string) =>
    format.date(locale, new Date(iso), { day: 'numeric', month: 'short' });
  const state = ourDriverState(driver, now);
  const days = driver.day_numbers
    .map((day) => t({ id: 'drivers.rate.day', message: `Day ${day}` }))
    .join(', ');
  const driverName = driver.name;
  const lovedCount = driver.crew_loved;
  const voters = driver.crew_voters;
  const loved =
    voters === 0
      ? null
      : t({ id: 'drivers.ours.loved', message: `${lovedCount} of ${voters} loved it` });
  const sentOn = state.kind === 'waiting' ? date(state.sentAt) : '';
  const openedOn = state.kind === 'waiting' && state.openedAt !== null ? date(state.openedAt) : '';
  const untilOn = state.kind === 'waiting' ? date(state.expiresAt) : '';
  return (
    <Card
      radius={th.radius.cardLarge}
      style={[styles.card, { gap: th.space.gap12 }]}
      testID={`drivers-ours-${driver.provider_id}`}
    >
      <View style={styles.head}>
        <Avatar name={driver.name} color={crewAccent(index + 2)} size={44} />
        <View style={styles.flex}>
          <Text variant="headline">{driver.name}</Text>
          <Text variant="caption" tone="muted">
            {[days, loved].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {state.kind === 'listed' ? (
          <StatusTag
            label={
              state.paused
                ? t({ id: 'drivers.ours.paused', message: 'Paused' })
                : t({ id: 'drivers.ours.listed', message: 'Listed' })
            }
            tone={state.paused ? 'unopened' : 'booked'}
          />
        ) : state.kind === 'waiting' ? (
          <StatusTag
            label={t({ id: 'drivers.ours.notClaimed', message: 'Not claimed' })}
            tone="maybe"
          />
        ) : null}
      </View>
      {state.kind === 'waiting' ? (
        <View
          style={[styles.timeline, { borderTopColor: th.color.hairline }]}
          testID="drivers-ours-timeline"
        >
          <Text variant="rowText">
            {t({ id: 'drivers.ours.sent', message: `Invite sent on WhatsApp · ${sentOn}` })}
          </Text>
          {state.openedAt === null ? null : (
            <Text variant="rowText">
              {t({
                id: 'drivers.ours.opened',
                message: `${driverName} opened the link · ${openedOn}`,
              })}
            </Text>
          )}
          <Text variant="rowText" tone="muted">
            {t({ id: 'drivers.ours.waiting', message: 'Waiting for him to confirm' })}
          </Text>
          <Text variant="captionMuted" tone="muted">
            {t({
              id: 'drivers.ours.until',
              message: `The link works until ${untilOn}. After that it switches off and nothing is listed.`,
            })}
          </Text>
          <View style={styles.buttons}>
            {state.canNudge ? (
              <View style={styles.flex}>
                <Button
                  size="small"
                  label={t({ id: 'drivers.ours.nudge', message: 'Nudge' })}
                  onPress={() => on.onNudge(state.inviteId)}
                  loading={busy}
                  testID="drivers-ours-nudge"
                />
              </View>
            ) : null}
            <View style={styles.flex}>
              <Button
                size="small"
                variant="control"
                label={t({ id: 'drivers.ours.cancel', message: 'Cancel invite' })}
                onPress={() => on.onCancel(state.inviteId)}
                testID="drivers-ours-cancel"
              />
            </View>
          </View>
        </View>
      ) : null}
      {state.kind === 'ended' ? (
        <Text variant="caption" tone="muted">
          {state.reason === 'expired'
            ? t({
                id: 'drivers.ours.expired',
                message: 'The link switched off. Nothing was listed.',
              })
            : t({ id: 'drivers.ours.cancelled', message: 'Invite cancelled. Nothing was listed.' })}
        </Text>
      ) : null}
      {state.kind === 'listed' ? null : (
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <Button
              size="small"
              variant="control"
              label={
                driver.my_verdict === null
                  ? t({ id: 'drivers.ours.rate', message: 'Rate him' })
                  : t({ id: 'drivers.ours.rerate', message: 'Change my answer' })
              }
              onPress={on.onRate}
              testID="drivers-ours-rate"
            />
          </View>
          {state.kind === 'waiting' ? null : (
            <View style={styles.flex}>
              <Button
                size="small"
                label={t({ id: 'drivers.ours.invite', message: 'Invite to be listed' })}
                onPress={on.onInvite}
                testID="drivers-ours-invite"
              />
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeline: { gap: 6, paddingTop: 12, borderTopWidth: 0.5 },
  buttons: { flexDirection: 'row', gap: 8 },
});
