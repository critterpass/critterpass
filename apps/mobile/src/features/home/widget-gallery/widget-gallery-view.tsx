/**
 * The widget gallery (5c-5) as a pure view: one card per home-screen widget with a small preview,
 * its tier, what it shows and a "+". The countdown preview carries the real days to go; the others
 * are drawn tiles. The caller supplies the rows and what "+" does.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { IconButton } from '@/ui/buttons/IconButton';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import type { DoodleName } from '@/ui/icons/generated';
import { Icon } from '@/ui/icons/Icon';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { LargeTitle, useLargeTitleCollapse } from '@/ui/shell/LargeTitle';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { GalleryKind, GalleryRow, GalleryTier } from './gallery-rows';

export interface WidgetGalleryViewProps {
  readonly rows: readonly GalleryRow[];
  /** Days to go on the countdown preview; null without a trip to count down to. */
  readonly countdownDays: number | null;
  readonly onAdd: (kind: GalleryKind) => void;
  readonly onBack?: () => void;
}

const TILE = 64;

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['12'] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    padding: t.space['12'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: t.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space['8'] },
  pill: {
    paddingHorizontal: t.space['8'],
    paddingVertical: t.space['2'],
    borderRadius: t.radius.pill,
  },
  bars: { gap: t.space['4'], width: TILE / 2 },
  bar: { height: 4, borderRadius: 2 },
}));

function Preview(props: { readonly kind: GalleryKind; readonly countdownDays: number | null }) {
  const styles = useStyles();
  const theme = useTheme();
  const ink = theme.color.paper.ink;
  const doodle = (name: DoodleName, color = ink) => (
    <Icon name={name} size={28} color={color} decorative />
  );
  const tiles: Record<GalleryKind, { readonly colour: string; readonly art: ReactNode }> = {
    countdown: {
      colour: theme.color.yellow,
      art:
        props.countdownDays === null ? (
          doodle('cal')
        ) : (
          <Text variant="h2" color={ink} testID="widgets-countdown-days">
            {String(props.countdownDays)}
          </Text>
        ),
    },
    vote: { colour: theme.color.orange, art: doodle('check') },
    today: {
      colour: theme.semantic.bg.base,
      art: (
        <View style={styles.bars}>
          <View style={[styles.bar, { backgroundColor: theme.color.yellow }]} />
          <View style={[styles.bar, { backgroundColor: theme.color.green.base }]} />
          <View style={[styles.bar, { backgroundColor: theme.color.blue }]} />
        </View>
      ),
    },
    balances: { colour: theme.color.green.base, art: doodle('wallet') },
    crew: { colour: theme.color.pink, art: doodle('pin') },
    next_flight: { colour: theme.semantic.bg.base, art: doodle('plane', theme.color.yellow) },
    critterdex: { colour: theme.color.blue, art: doodle('egg') },
  };
  const tile = tiles[props.kind];
  return <View style={[styles.tile, { backgroundColor: tile.colour }]}>{tile.art}</View>;
}

export function WidgetGalleryView(props: WidgetGalleryViewProps) {
  const { t, i18n } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const { collapse, collapsed, onScroll } = useLargeTitleCollapse();

  const copy: Record<GalleryKind, { readonly title: string; readonly line: string }> = {
    countdown: {
      title: t({ id: 'home.widgets.countdown', message: 'Countdown' }),
      line: t({ id: 'home.widgets.countdownLine', message: 'Small · home and lock screen' }),
    },
    vote: {
      title: t({ id: 'home.widgets.vote', message: 'The vote' }),
      line: t({ id: 'home.widgets.voteLine', message: 'Medium · tap to vote' }),
    },
    today: {
      title: t({ id: 'home.widgets.today', message: 'Today' }),
      line: t({ id: 'home.widgets.todayLine', message: 'Large · the day’s plan and weather' }),
    },
    balances: {
      title: t({ id: 'home.widgets.balances', message: 'Balances' }),
      line: t({ id: 'home.widgets.balancesLine', message: 'Small · who owes who, and a nudge' }),
    },
    crew: {
      title: t({ id: 'home.widgets.crew', message: 'Crew, live' }),
      line: t({
        id: 'home.widgets.crewLine',
        message: 'Small or medium · everyone near the meet-up',
      }),
    },
    next_flight: {
      title: t({ id: 'home.widgets.nextFlight', message: 'Next flight' }),
      line: t({ id: 'home.widgets.nextFlightLine', message: 'Small · gate, seat, boarding time' }),
    },
    critterdex: {
      title: t({ id: 'home.widgets.critterdex', message: 'Critterdex' }),
      line: t({ id: 'home.widgets.critterdexLine', message: 'Small · the critters you’ve met' }),
    },
  };
  const tiers: Record<
    GalleryTier,
    { readonly word: string; readonly bg: string; readonly fg: string }
  > = {
    free: {
      word: t({ id: 'home.widgets.tier.free', message: 'Free' }),
      bg: theme.semantic.bg.control,
      fg: theme.semantic.text.primary,
    },
    boost: {
      word: t({ id: 'home.widgets.tier.boost', message: 'Boost' }),
      bg: theme.color.pink,
      fg: theme.color.paper.ink,
    },
    pass_plus: {
      word: t({ id: 'home.widgets.tier.passPlus', message: 'Pass+' }),
      bg: theme.color.yellow,
      fg: theme.color.paper.ink,
    },
  };

  return (
    <Scaffold variant="dark" edges={['top']} testID="widgets">
      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: theme.space['32'] }}
      >
        <View style={{ backgroundColor: theme.semantic.bg.base }}>
          <LargeTitle
            title={t({ id: 'home.widgets.title', message: 'Widgets' })}
            collapse={collapse}
            collapsed={collapsed}
            start={
              <BackEyebrow
                label={t({ id: 'home.widgets.back', message: 'Settings' })}
                onPress={props.onBack}
                testID="widgets-back"
              />
            }
          />
        </View>
        <View style={styles.content}>
          <SecondaryText>
            {t({
              id: 'home.widgets.intro',
              message:
                'Put the trip on your home screen. Tokek keeps them up to date, even offline.',
            })}
          </SecondaryText>
          {props.rows.map((row) => {
            const { title, line } = copy[row.kind];
            const tier = tiers[row.tier];
            return (
              <View key={row.kind} style={styles.card} testID={`widgets-${row.kind}`}>
                <Preview kind={row.kind} countdownDays={props.countdownDays} />
                <Stack gap="4" flex={1}>
                  <View style={styles.head}>
                    <Text variant="h3">{upper(title, i18n.locale)}</Text>
                    <View style={[styles.pill, { backgroundColor: tier.bg }]}>
                      <Text variant="label" color={tier.fg}>
                        {upper(tier.word, i18n.locale)}
                      </Text>
                    </View>
                  </View>
                  <SecondaryText>{line}</SecondaryText>
                </Stack>
                <IconButton
                  label={
                    row.added
                      ? t({ id: 'home.widgets.addAnother', message: `Add another ${title}` })
                      : t({ id: 'home.widgets.add', message: `Add ${title}` })
                  }
                  onPress={() => props.onAdd(row.kind)}
                  surface="cream"
                  {...(row.added
                    ? { icon: 'check' as const }
                    : {
                        glyph: (
                          <Text variant="h3" color={theme.color.paper.ink}>
                            +
                          </Text>
                        ),
                      })}
                  testID={`widgets-${row.kind}-add`}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Scaffold>
  );
}
