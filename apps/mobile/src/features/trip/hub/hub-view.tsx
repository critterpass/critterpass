/**
 * The trip hub (3k-1) from props: header by phase, the next thing (today's item or the flight),
 * the guide's briefing, the tiles and the activity ticker. The lab scenes render it with fixed
 * data; the screen feeds it synced rows.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import type { GuideId } from '@/ui/people/GuideLine';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { Skeleton } from '@/ui/states/Skeleton';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { BriefingCard } from '../briefing/briefing-card';
import type { BriefingLine, BriefingState } from '../briefing/briefing-model';
import type { HubHeader } from './hub-model';
import { PhaseHeader } from './phase-header';
import { Ticker, type TickerEvent } from './ticker';
import { HubTiles } from './tiles';

export interface HubNext {
  readonly eyebrow: string;
  readonly time: string;
  readonly title: string;
  readonly detail: string | null;
  readonly tone: 'raised' | 'pink';
  readonly onPress: () => void;
}

export interface HubViewProps {
  readonly state: 'loading' | 'ready';
  readonly header: HubHeader;
  readonly now: Date;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly going: number;
  readonly destination: string;
  readonly colour: string;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly guestGuide: boolean;
  readonly planning: { readonly label: string; readonly onPress: () => void } | null;
  readonly next: HubNext | null;
  readonly briefing: BriefingState;
  readonly onAct: (line: BriefingLine) => void;
  readonly tiles: readonly { key: string; node: ReactNode }[];
  readonly ticker: readonly TickerEvent[];
  /** Another trip is under way or being planned: "Switch trip". */
  readonly onSwitch: (() => void) | null;
  /** Replaces the header while offline (3k-4). */
  readonly offlineCard?: ReactNode;
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, gap: th.space['16'] },
}));

function NextCard({ next }: { readonly next: HubNext }) {
  const theme = useTheme();
  const locale = useLocale();
  const ink = next.tone === 'pink' ? theme.semantic.text.onAccent : theme.semantic.text.primary;
  return (
    <Card
      tone={next.tone}
      halftone={next.tone === 'pink'}
      onPress={next.onPress}
      accessibilityLabel={[next.eyebrow, next.time, next.title, next.detail]
        .filter(Boolean)
        .join(', ')}
      testID="trip-hub-next"
    >
      <Row gap="14" align="center">
        <Stack gap="2" flex={1}>
          <Text variant="eyebrow" color={ink}>
            {upper(next.eyebrow, locale)}
          </Text>
          <Text variant="title" color={ink}>
            {upper(next.title, locale)}
          </Text>
          {next.detail === null ? null : (
            <Text variant="bodySm" color={ink}>
              {next.detail}
            </Text>
          )}
        </Stack>
        <Text variant="h2" color={ink} style={{ fontVariant: ['tabular-nums'] }}>
          {next.time}
        </Text>
      </Row>
    </Card>
  );
}

export function HubView(props: HubViewProps) {
  // The hub is the TRIPS tab's own screen (3k-1 draws no back); a pushed one has Switch trip.
  useNoBackByDesign();
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const inset = useTabBarInset();
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
  return (
    <Scaffold variant="dark" edges={['top']} testID="trip-hub">
      <ScrollView
        contentContainerStyle={{
          paddingBottom: inset + theme.space['16'],
          paddingTop: theme.space['12'],
        }}
      >
        <View style={styles.body}>
          {props.onSwitch === null && !props.guestGuide ? null : (
            <Row justify="space-between" align="center">
              {props.guestGuide ? (
                <InfoPill>
                  {t({ id: 'trip.hub.guestGuide', message: `${guideName} is a guest here` })}
                </InfoPill>
              ) : (
                <View />
              )}
              {props.onSwitch === null ? null : (
                <TextLink
                  label={t({ id: 'trip.hub.switch', message: 'Switch trip' })}
                  onPress={props.onSwitch}
                  testID="trip-hub-switch"
                />
              )}
            </Row>
          )}
          {props.offlineCard ?? (
            <PhaseHeader
              header={props.header}
              now={props.now}
              startDate={props.startDate}
              endDate={props.endDate}
              going={props.going}
              destination={props.destination}
              colour={props.colour}
              planning={props.planning}
              below={props.next === null ? null : <NextCard next={props.next} />}
            />
          )}
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
      </ScrollView>
    </Scaffold>
  );
}
