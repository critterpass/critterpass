/**
 * Our drivers (6g-3): the drivers this crew used. One not yet confirmed shows NOT CLAIMED with the
 * timeline (invite sent, link opened, waiting), when the link switches off, NUDGE once and CANCEL
 * INVITE; a confirmed one shows LISTED. Unclaimed drivers are only visible to this crew.
 */
import { format, upper } from '@cp/i18n';
import type { OurDriver } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { useActiveGuide } from '@/lib/navigation/active-guide';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { initialsColour } from '../directory/DriverCard';
import { ourDriverState } from './timeline';

const useStyles = makeStyles((t) => ({
  card: { backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.lg, padding: 16, gap: 12 },
  initials: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { borderRadius: t.radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
}));

export interface OurDriversViewProps {
  readonly drivers: readonly OurDriver[];
  readonly crewSize: number;
  readonly now: Date;
  readonly busy: string | null;
  readonly onBack: () => void;
  readonly onRate: (providerId: string) => void;
  readonly onInvite: (providerId: string) => void;
  readonly onNudge: (driver: OurDriver, inviteId: string) => void;
  readonly onCancel: (inviteId: string) => void;
  readonly onDirectory: () => void;
}

export function OurDriversView(props: OurDriversViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const date = (iso: string) =>
    format.date(locale, new Date(iso), { day: 'numeric', month: 'short' });
  const crew = props.crewSize;
  const { guideId } = useActiveGuide();
  const guide = guideSticker(guideId);
  const empty = props.drivers.length === 0;
  // The note about nudging only means something while an invite is waiting on a driver.
  const waiting = props.drivers.some(
    (driver) => ourDriverState(driver, props.now).kind === 'waiting',
  );
  return (
    <Scaffold testID="drivers-ours">
      <ScrollView
        contentContainerStyle={{
          padding: theme.space['20'],
          gap: theme.space['16'],
          paddingBottom: theme.space['32'] + theme.space['16'],
        }}
      >
        <BackEyebrow
          label={t({ id: 'drivers.ours.back', message: 'Getting around' })}
          onPress={props.onBack}
        />
        <Text variant="displayXl">
          {upper(t({ id: 'drivers.ours.title', message: 'Our drivers' }), locale)}
        </Text>
        {empty ? (
          <EmptyState
            guide={guideId}
            guideName={guide.name}
            sticker={<Sticker kind={guide.kind} name={guide.name} pose="sleep" size={120} />}
            title={t({ id: 'drivers.ours.emptyTitle', message: 'No drivers yet' })}
            line={t({
              id: 'drivers.ours.emptyLine',
              message: 'Ride with someone on this trip and they land here for the crew.',
            })}
            action={{
              label: t({ id: 'drivers.ours.directory', message: 'Drivers other crews loved' }),
              onPress: props.onDirectory,
            }}
            testID="drivers-ours-empty"
          />
        ) : (
          <Text variant="body" color={theme.semantic.text.secondary}>
            {t({
              id: 'drivers.ours.intro',
              message: `Drivers this crew used. The ones who haven't confirmed are only visible to you ${crew}.`,
            })}
          </Text>
        )}
        {props.drivers.map((driver) => {
          const state = ourDriverState(driver, props.now);
          const days = driver.day_numbers
            .map((day) => t({ id: 'drivers.rate.day', message: `Day ${day}` }))
            .join(', ');
          const driverName = driver.name;
          const lovedCount = driver.crew_loved;
          const voters = driver.crew_voters;
          const loved =
            driver.crew_voters === 0
              ? null
              : t({
                  id: 'drivers.ours.loved',
                  message: `${lovedCount} of ${voters} loved it`,
                });
          const busy = props.busy === driver.provider_id;
          const sentOn = state.kind === 'waiting' ? date(state.sentAt) : '';
          const openedOn =
            state.kind === 'waiting' && state.openedAt !== null ? date(state.openedAt) : '';
          const untilOn = state.kind === 'waiting' ? date(state.expiresAt) : '';
          return (
            <Stack
              key={driver.provider_id}
              style={styles.card}
              testID={`drivers-ours-${driver.provider_id}`}
            >
              <Row gap="12" align="center">
                <View
                  style={[
                    styles.initials,
                    { backgroundColor: initialsColour(theme, driver.provider_id) },
                  ]}
                >
                  <Text variant="title" color={theme.semantic.text.onAccent}>
                    {driver.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Stack gap="2" style={{ flex: 1 }}>
                  <Text variant="rowTitle">{upper(driver.name, locale)}</Text>
                  <Text variant="bodySm" color={theme.semantic.text.secondary}>
                    {[days, loved].filter(Boolean).join(' · ')}
                  </Text>
                </Stack>
                {state.kind === 'listed' || state.kind === 'waiting' ? (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          state.kind === 'listed' ? theme.color.green.base : theme.color.yellow,
                      },
                    ]}
                  >
                    <Text variant="label" color={theme.semantic.text.onAccent}>
                      {upper(
                        state.kind === 'listed'
                          ? state.paused
                            ? t({ id: 'drivers.ours.paused', message: 'Paused' })
                            : t({ id: 'drivers.ours.listed', message: 'Listed' })
                          : t({ id: 'drivers.ours.notClaimed', message: 'Not claimed' }),
                        locale,
                      )}
                    </Text>
                  </View>
                ) : null}
              </Row>
              {state.kind === 'waiting' ? (
                <Stack gap="6" testID="drivers-ours-timeline">
                  <Text variant="bodySm">
                    {t({ id: 'drivers.ours.sent', message: `Invite sent on WhatsApp · ${sentOn}` })}
                  </Text>
                  {state.openedAt === null ? null : (
                    <Text variant="bodySm">
                      {t({
                        id: 'drivers.ours.opened',
                        message: `${driverName} opened the link · ${openedOn}`,
                      })}
                    </Text>
                  )}
                  <Text variant="bodySm" color={theme.semantic.text.secondary}>
                    {t({ id: 'drivers.ours.waiting', message: 'Waiting for him to confirm' })}
                  </Text>
                  <Text variant="caption" color={theme.semantic.text.secondary}>
                    {t({
                      id: 'drivers.ours.until',
                      message: `The link works until ${untilOn}. After that it switches off and nothing is listed.`,
                    })}
                  </Text>
                  <Row gap="8">
                    {state.canNudge ? (
                      <View style={{ flex: 1 }}>
                        <PillButton
                          size="sm"
                          label={t({ id: 'drivers.ours.nudge', message: 'Nudge' })}
                          onPress={() => props.onNudge(driver, state.inviteId)}
                          loading={busy}
                          testID="drivers-ours-nudge"
                        />
                      </View>
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <PillButton
                        size="sm"
                        variant="secondary"
                        label={t({ id: 'drivers.ours.cancel', message: 'Cancel invite' })}
                        onPress={() => props.onCancel(state.inviteId)}
                        testID="drivers-ours-cancel"
                      />
                    </View>
                  </Row>
                </Stack>
              ) : null}
              {state.kind === 'ended' ? (
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {state.reason === 'expired'
                    ? t({
                        id: 'drivers.ours.expired',
                        message: 'The link switched off. Nothing was listed.',
                      })
                    : t({
                        id: 'drivers.ours.cancelled',
                        message: 'Invite cancelled. Nothing was listed.',
                      })}
                </Text>
              ) : null}
              {state.kind === 'listed' ? null : (
                <Row gap="8">
                  <View style={{ flex: 1 }}>
                    <PillButton
                      size="sm"
                      variant="secondary"
                      label={
                        driver.my_verdict === null
                          ? t({ id: 'drivers.ours.rate', message: 'Rate him' })
                          : t({ id: 'drivers.ours.rerate', message: 'Change my answer' })
                      }
                      onPress={() => props.onRate(driver.provider_id)}
                      testID="drivers-ours-rate"
                    />
                  </View>
                  {state.kind === 'waiting' ? null : (
                    <View style={{ flex: 1 }}>
                      <PillButton
                        size="sm"
                        label={t({ id: 'drivers.ours.invite', message: 'Invite to be listed' })}
                        onPress={() => props.onInvite(driver.provider_id)}
                        testID="drivers-ours-invite"
                      />
                    </View>
                  )}
                </Row>
              )}
            </Stack>
          );
        })}
        {waiting ? (
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {t({
              id: 'drivers.ours.noChase',
              message: "I won't chase him. One nudge from you is plenty.",
            })}
          </Text>
        ) : null}
        {empty ? null : (
          <PillButton
            variant="secondary"
            label={t({ id: 'drivers.ours.directory', message: 'Drivers other crews loved' })}
            onPress={props.onDirectory}
            testID="drivers-ours-directory"
          />
        )}
      </ScrollView>
    </Scaffold>
  );
}
