/**
 * The trip hub (3k-1) from props: the header by phase, full-bleed from the top of the screen, then
 * on one gutter the next thing (the first day, the flight, today's leave-by or stop), the guide's
 * briefing and the tiles, and the activity ticker. The lab scenes render it with fixed
 * data; the screen feeds it synced rows.
 */
import { tokens } from '@cp/design-tokens';
import type { MediaAsset } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useRef, type ReactNode } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { Row } from '@/ui/layout/Row';
import type { GuideId } from '@/ui/people/GuideLine';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { Skeleton } from '@/ui/states/Skeleton';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles, useTheme } from '@/ui/theme';

import { BriefingCard } from '../briefing/briefing-card';
import type { BriefingLine, BriefingState } from '../briefing/briefing-model';
import type { HubHeader } from './hub-model';
import { NextRow, type HubNext } from './next-row';
import { PhaseHeader } from './phase-header';
import { Ticker, type TickerEvent } from './ticker';
import { HubTiles } from './tiles';

export type { HubNext } from './next-row';

export interface HubViewProps {
  readonly state: 'loading' | 'ready';
  readonly header: HubHeader;
  readonly now: Date;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly going: number;
  readonly destination: string;
  readonly colour: string;
  /** The destination photo under the header; null keeps the plain dark header. */
  readonly heroMedia?: MediaAsset | null;
  readonly mediaLowData?: boolean;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly guestGuide: boolean;
  readonly planning: { readonly label: string; readonly onPress: () => void } | null;
  /** What comes next in this phase, one compact row each. */
  readonly entries: readonly HubNext[];
  readonly briefing: BriefingState;
  readonly onAct: (line: BriefingLine) => void;
  readonly tiles: readonly { key: string; node: ReactNode }[];
  readonly ticker: readonly TickerEvent[];
  /** Another trip is under way or being planned: the SWITCH TRIP pill. */
  readonly onSwitch: (() => void) | null;
  /** Replaces the header while offline (3k-4). */
  readonly offlineCard?: ReactNode;
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, gap: th.space['16'] },
  statusBar: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    backgroundColor: th.semantic.bg.base,
  },
}));

/** How far the hub scrolls before the status bar is back on solid ink. */
const STATUS_BAR_FADE_PT = tokens.space['32'];

export function HubView(props: HubViewProps) {
  // The hub is the TRIPS tab's own screen (3k-1 draws no back); a pushed one has Switch trip.
  useNoBackByDesign();
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const inset = useTabBarInset();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const scrollY = useRef(new Animated.Value(0)).current;
  const { guideName } = props;
  if (props.state === 'loading') {
    return (
      <Scaffold variant="dark" edges={['top']} testID="trip-hub-loading">
        <View style={[styles.body, { paddingTop: theme.space['20'] }]}>
          <Skeleton preset="card" />
          <Skeleton preset="lines" repeat={2} />
          <Skeleton preset="card" repeat={2} />
        </View>
      </Scaffold>
    );
  }
  const top = insets.top + theme.space['12'];
  return (
    <Scaffold variant="dark" edges={[]} testID="trip-hub">
      <Animated.ScrollView
        contentContainerStyle={{ paddingBottom: inset + theme.space['16'] }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        {props.offlineCard === undefined ? (
          <PhaseHeader
            header={props.header}
            now={props.now}
            startDate={props.startDate}
            endDate={props.endDate}
            going={props.going}
            destination={props.destination}
            colour={props.colour}
            media={props.heroMedia ?? null}
            mediaLowData={props.mediaLowData ?? false}
            planning={props.planning}
            onSwitch={props.onSwitch}
            guestGuideName={props.guestGuide ? guideName : null}
          />
        ) : null}
        <View
          style={[
            styles.body,
            { paddingTop: props.offlineCard === undefined ? theme.space['4'] : top },
          ]}
        >
          {props.offlineCard === undefined || props.onSwitch === null ? null : (
            <Row justify="flex-end">
              <InlineAction
                label={upper(t({ id: 'trip.hub.switch', message: 'Switch trip' }), locale)}
                onPress={props.onSwitch}
                testID="trip-hub-switch"
              />
            </Row>
          )}
          {props.offlineCard}
          {props.offlineCard !== undefined
            ? null
            : props.entries.map((entry) => <NextRow key={entry.testID} next={entry} />)}
          <BriefingCard
            state={props.briefing}
            guide={props.guide}
            guideName={props.guideName}
            onAct={props.onAct}
          />
          {props.tiles.length === 0 ? null : <HubTiles tiles={props.tiles} />}
        </View>
        <View style={{ marginTop: theme.space['16'] }}>
          <Ticker events={props.ticker} />
        </View>
      </Animated.ScrollView>
      {/* The header runs under the status bar; once it scrolls away, the bar gets its ink back. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.statusBar,
          {
            height: insets.top,
            opacity: scrollY.interpolate({
              inputRange: [0, STATUS_BAR_FADE_PT],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            }),
          },
        ]}
      />
    </Scaffold>
  );
}
