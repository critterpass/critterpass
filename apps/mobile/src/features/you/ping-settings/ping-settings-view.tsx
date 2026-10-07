/**
 * "How much we ping" (5b-4) as a pure view: the daily budget bar, the evening roundup, the
 * category rows and the note on what always gets through. Values and handlers come from the
 * caller: the screen passes the person's synced settings, a lab scene passes fixed ones.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Fragment, type ReactNode } from 'react';
import { I18nManager, ScrollView, View } from 'react-native';

import { guideSticker } from '@/ui/avatar';
import { Card } from '@/ui/cards/Card';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import type { DoodleName } from '@/ui/icons/generated';
import { Icon } from '@/ui/icons/Icon';
import { SegmentBudget } from '@/ui/inputs/SegmentBudget';
import { Toggle } from '@/ui/inputs/Toggle';
import { Stack } from '@/ui/layout/Stack';
import { DeniedRow } from '@/ui/permission-primer/DeniedRow';
import { PressScale } from '@/ui/press/PressScale';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { LargeTitle, useLargeTitleCollapse } from '@/ui/shell/LargeTitle';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { AlwaysNote } from './always-note';
import { BUDGET_MAX, type CrewChatMode, type PingPrefs } from './ping-prefs';

export interface PingSettingsViewProps {
  readonly prefs: PingPrefs;
  /** The OS refuses notifications for the app: say so, with the way to Settings. */
  readonly notificationsOff: boolean;
  readonly onBudget: (budget: number) => void;
  readonly onRoundupTime: () => void;
  readonly onGuideTips: (next: boolean) => void;
  readonly onCrewChat: () => void;
  readonly onMoney: (next: boolean) => void;
  readonly onCrittersNearby: (next: boolean) => void;
  readonly onQuietHours: () => void;
  readonly onOpenSettings: () => void;
  /** What the phone's settings still hold back from what always gets through (Android). */
  readonly systemLimits?: ReactNode;
  readonly onBack?: () => void;
}

const TILE = 40;

/**
 * The budget level ("ABOUT 10 A DAY") never shrinks into the label's line: it wraps under the
 * label instead, and grows to the end of whichever line it is on. A box the size of its own
 * measured text cuts the last word on Android, where the drawn text runs a little wider.
 */
export const BUDGET_LEVEL_STYLE = {
  flexShrink: 0,
  flexGrow: 1,
  maxWidth: '100%',
  textAlign: 'right',
} as const;

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['14'] },
  budget: { padding: t.size.cardInner.max, gap: t.space['10'] },
  budgetHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: t.space['12'],
    rowGap: t.space['4'],
  },
  budgetLabel: { flexShrink: 0 },
  budgetLevel: BUDGET_LEVEL_STYLE,
  group: { backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.lg, overflow: 'hidden' },
  row: {
    minHeight: MIN_TOUCH_TARGET + t.space['12'],
    paddingHorizontal: t.size.cardInner.max,
    paddingVertical: t.space['10'],
    alignItems: 'center',
    flexDirection: 'row',
    gap: t.space['12'],
  },
  divider: { height: 1, marginHorizontal: t.size.cardInner.max, backgroundColor: t.color.divider },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: t.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
}));

interface RowSpec {
  readonly key: string;
  readonly title: string;
  readonly subtitle: string;
  readonly tile?: { readonly colour: string; readonly art: ReactNode };
  readonly control:
    | { readonly kind: 'toggle'; readonly value: boolean; readonly onChange: (v: boolean) => void }
    | { readonly kind: 'open'; readonly value?: string; readonly onPress: () => void };
}

function PingRow({ row }: { readonly row: RowSpec }) {
  const styles = useStyles();
  const theme = useTheme();
  const chevron = I18nManager.isRTL ? '‹' : '›';
  const body = (
    <>
      {row.tile ? (
        <View style={[styles.tile, { backgroundColor: row.tile.colour }]}>{row.tile.art}</View>
      ) : null}
      <Stack gap="2" flex={1}>
        <Text variant="rowTitle">{row.title}</Text>
        <SecondaryText>{row.subtitle}</SecondaryText>
      </Stack>
    </>
  );
  const label = [row.title, row.subtitle].join(', ');
  if (row.control.kind === 'toggle') {
    return (
      <View style={styles.row} testID={`you-pings-${row.key}`}>
        {body}
        <Toggle
          value={row.control.value}
          onValueChange={row.control.onChange}
          label={label}
          testID={`you-pings-${row.key}-toggle`}
        />
      </View>
    );
  }
  return (
    <PressScale
      onPress={row.control.onPress}
      widthClass="wide"
      accessibilityLabel={[label, row.control.value].filter(Boolean).join(', ')}
      style={styles.row}
      testID={`you-pings-${row.key}`}
    >
      {body}
      <Text
        variant="rowTitle"
        color={row.control.value ? theme.semantic.action.primary : theme.semantic.text.secondary}
      >
        {row.control.value ? `${row.control.value} ${chevron}` : chevron}
      </Text>
    </PressScale>
  );
}

export function PingSettingsView(props: PingSettingsViewProps) {
  const { t, i18n } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const { collapse, collapsed, onScroll } = useLargeTitleCollapse();
  const { prefs } = props;
  const ink = theme.color.paper.ink;
  const doodle = (name: DoodleName) => <Icon name={name} size={22} color={ink} decorative />;
  const tokek = guideSticker('tokek');

  const chatLine: Record<CrewChatMode, string> = {
    all: t({ id: 'you.pings.crewChat.all', message: 'Every message' }),
    mentions: t({ id: 'you.pings.crewChat.mentions', message: 'Mentions only' }),
    off: t({ id: 'you.pings.crewChat.off', message: 'Off' }),
  };
  const quietOff = prefs.quietFrom === prefs.quietTo;

  const rows: readonly RowSpec[] = [
    {
      key: 'roundup',
      title: t({ id: 'you.pings.roundup', message: 'Evening roundup' }),
      subtitle: t({
        id: 'you.pings.roundupLine',
        message: `One card at ${prefs.roundupTime} with the small stuff`,
      }),
      control: { kind: 'open', value: prefs.roundupTime, onPress: props.onRoundupTime },
    },
    {
      key: 'guide-tips',
      title: t({ id: 'you.pings.guideTips', message: 'Guide tips' }),
      subtitle: t({ id: 'you.pings.guideTipsLine', message: 'From the guide of each trip' }),
      tile: {
        colour: theme.color.yellow,
        art: <Sticker kind={tokek.kind} name={tokek.name} size={TILE - 8} />,
      },
      control: { kind: 'toggle', value: prefs.guideTips, onChange: props.onGuideTips },
    },
    {
      key: 'crew-chat',
      title: t({ id: 'you.pings.crewChat', message: 'Crew chat' }),
      subtitle: chatLine[prefs.crewChat],
      tile: { colour: theme.color.pink, art: doodle('chat') },
      control: { kind: 'open', onPress: props.onCrewChat },
    },
    {
      key: 'money',
      title: t({ id: 'you.pings.money', message: 'Money' }),
      subtitle: t({ id: 'you.pings.moneyLine', message: 'When someone pays or owes you' }),
      tile: { colour: theme.color.green.base, art: doodle('wallet') },
      control: { kind: 'toggle', value: prefs.money, onChange: props.onMoney },
    },
    {
      key: 'critters',
      title: t({ id: 'you.pings.critters', message: 'Critters nearby' }),
      subtitle: t({ id: 'you.pings.crittersLine', message: 'Only when you’re already there' }),
      tile: { colour: theme.color.blue, art: doodle('spark') },
      control: { kind: 'toggle', value: prefs.crittersNearby, onChange: props.onCrittersNearby },
    },
    {
      key: 'quiet',
      title: t({ id: 'you.pings.quiet', message: 'Quiet hours' }),
      subtitle: quietOff
        ? t({ id: 'you.pings.quietOffLine', message: 'Pings arrive at any hour' })
        : t({ id: 'you.pings.quietLine', message: 'Pings wait until you’re up' }),
      control: {
        kind: 'open',
        value: quietOff
          ? t({ id: 'you.pings.quietOff', message: 'Off' })
          : `${prefs.quietFrom}–${prefs.quietTo}`,
        onPress: props.onQuietHours,
      },
    },
  ];

  return (
    <Scaffold variant="dark" edges={['top']} testID="you-pings">
      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: theme.space['32'] }}
      >
        <View style={{ backgroundColor: theme.semantic.bg.base }}>
          <LargeTitle
            title={t({ id: 'you.pings.title', message: 'How much we ping' })}
            collapse={collapse}
            collapsed={collapsed}
            start={
              <BackEyebrow
                label={t({ id: 'you.pings.back', message: 'Settings' })}
                onPress={props.onBack}
                testID="you-pings-back"
              />
            }
          />
        </View>
        <View style={styles.content}>
          <Card style={styles.budget} testID="you-pings-budget">
            {/* The level keeps its words whole: beside the label while they fit, under it when a
                longer number or language needs the room. It is never fitted to one line: its box
                fills the rest of its line, so the platform has room to set the last word. */}
            <View style={styles.budgetHead}>
              <Text variant="rowTitle" style={styles.budgetLabel}>
                {t({ id: 'you.pings.budget', message: 'Ping budget' })}
              </Text>
              <Text
                variant="h3"
                color={theme.semantic.action.primary}
                style={styles.budgetLevel}
                textBreakStrategy="simple"
                testID="you-pings-level"
              >
                {upper(
                  t({ id: 'you.pings.level', message: `About ${prefs.budget} a day` }),
                  i18n.locale,
                )}
              </Text>
            </View>
            <SegmentBudget
              value={prefs.budget}
              onChange={props.onBudget}
              segments={BUDGET_MAX}
              label={t({ id: 'you.pings.budgetLabel', message: 'Pings per day' })}
              testID="you-pings-bar"
            />
            <SecondaryText>
              {t({
                id: 'you.pings.overBudget',
                message: `Over budget, the rest waits for the ${prefs.roundupTime} roundup.`,
              })}
            </SecondaryText>
            {props.notificationsOff ? (
              <DeniedRow
                line={t({
                  id: 'you.pings.notificationsOff',
                  message: 'Notifications are off, so nothing reaches your lock screen.',
                })}
                onOpenSettings={props.onOpenSettings}
                testID="you-pings-denied"
              />
            ) : null}
          </Card>
          <View style={styles.group}>
            {rows.map((row, index) => (
              <Fragment key={row.key}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <PingRow row={row} />
              </Fragment>
            ))}
          </View>
          <AlwaysNote>{props.systemLimits}</AlwaysNote>
        </View>
      </ScrollView>
    </Scaffold>
  );
}
