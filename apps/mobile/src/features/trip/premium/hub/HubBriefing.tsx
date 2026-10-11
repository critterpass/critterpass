/**
 * The guide's briefing on the premium hub (6.01, 6.02): a white card with the guide's sticker
 * leaning over its corner, "Tokek's briefing · today" and its lines, each with a chip (Done in the
 * booked tint, Nudge in ink, Set and Open on the control fill). While the first read is pending it
 * is a skeleton; with nothing new it is the guide's one line; a failed build says so and that the
 * rest of the hub still works.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  CritterSticker,
  Icon,
  PressableScale,
  Skeleton,
  Text,
  usePremiumTheme,
  type PremiumTheme,
} from '@/ui/premium';

import { briefingChipLabel, briefingDate, useNothingToday } from '../../briefing/briefing-copy';
import type { BriefingLine, BriefingState } from '../../briefing/briefing-model';
import { LineIcon, type LineIconName } from '../components/LineIcon';
import { turn } from '../components/turn';

const ICONS: Readonly<Record<string, LineIconName>> = {
  ticket: 'card',
  plane: 'plane',
  wallet: 'wallet',
  alarm: 'bell',
  key: 'shield',
  vote: 'star',
  chat: 'chat',
  sun: 'sun',
  bag: 'walk',
};

function chipLook(th: PremiumTheme, line: BriefingLine): { bg: string; fg: string } {
  if (line.action === 'done') return th.color.status.booked;
  if (line.action === 'nudge' && line.status !== 'nudged') {
    return { bg: th.color.ink, fg: th.color.onInk };
  }
  return { bg: th.color.control, fg: th.color.ink };
}

function Line(props: {
  readonly line: BriefingLine;
  readonly last: boolean;
  readonly onAct: (line: BriefingLine) => void;
}) {
  const th = usePremiumTheme();
  const { line } = props;
  const label = briefingChipLabel(line);
  const acted = line.status !== 'open';
  const look = chipLook(th, line);
  const done = line.action === 'done' && line.status === 'done';
  return (
    <View
      style={[
        styles.line,
        props.last ? null : { borderBottomWidth: 0.5, borderBottomColor: th.color.hairline },
      ]}
      testID={`trip-briefing-line-${line.id}`}
    >
      <View style={styles.icon}>
        {done ? (
          <Icon name="check" size={24} color={th.color.status.booked.text} />
        ) : (
          <LineIcon name={ICONS[line.icon] ?? 'sun'} size={24} />
        )}
      </View>
      <Text variant="rowText" style={styles.text}>
        {line.text}
      </Text>
      <PressableScale
        onPress={() => props.onAct(line)}
        disabled={acted && line.action !== 'open'}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${line.text}`}
        testID={`trip-briefing-chip-${line.id}`}
      >
        <View style={[styles.chip, { backgroundColor: look.bg, borderRadius: 15 }]}>
          <Text variant="noteAction" color={look.fg}>
            {label}
          </Text>
        </View>
      </PressableScale>
    </View>
  );
}

export interface HubBriefingProps {
  readonly state: BriefingState;
  readonly guideKind: string;
  readonly guideName: string;
  readonly onAct: (line: BriefingLine) => void;
}

export function HubBriefing({ state, guideKind, guideName, onAct }: HubBriefingProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const nothing = useNothingToday(state.kind === 'none' ? state.next : null);
  if (state.kind === 'hidden') return null;
  const stale =
    state.kind === 'ready' && state.staleDate !== null
      ? t({
          id: 'trip.briefing.fromDate',
          message: `from ${briefingDate(locale, state.staleDate)}`,
        })
      : t({ id: 'trip.briefing.today', message: 'today' });
  return (
    <View
      style={[
        styles.card,
        {
          marginHorizontal: th.space.gutter,
          borderRadius: th.radius.cardLarge,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
      testID={`trip-briefing-${state.kind}`}
    >
      <View style={[styles.sticker, { transform: [turn(8)] }]} pointerEvents="none">
        <CritterSticker kind={guideKind} name={guideName} size={state.kind === 'failed' ? 56 : 72} />
      </View>
      {state.kind === 'failed' ? (
        <View style={styles.failed}>
          <Text variant="badge" color={th.color.status.tangerine.text}>
            {t({ id: 'trip.briefing.premium.eyebrow', message: "THIS MORNING'S BRIEFING" })}
          </Text>
          <Text variant="headline" style={styles.titleRight}>
            {t({ id: 'trip.briefing.premium.failedTitle', message: "I couldn't write today's yet" })}
          </Text>
          <Text variant="rowText" tone="inkSecondary">
            {t({
              id: 'trip.briefing.failed',
              message: "Today's briefing didn't come through. The plan below is up to date.",
            })}
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.head, styles.titleRight]}>
            <Text variant="headline" accessibilityRole="header">
              {t({ id: 'trip.briefing.premium.title', message: `${guideName}'s briefing` })}
            </Text>
            {state.kind === 'ready' ? (
              <Text variant="caption" tone="muted">
                {stale}
              </Text>
            ) : null}
          </View>
          {state.kind === 'loading' ? (
            <View style={styles.loading} testID="trip-briefing-skeleton">
              <Skeleton height={14} radius={7} />
              <Skeleton height={14} radius={7} />
            </View>
          ) : state.kind === 'none' ? (
            <Text variant="rowText" tone="inkSecondary" style={styles.none}>
              {nothing}
            </Text>
          ) : (
            state.lines.map((line, index) => (
              <Line
                key={line.id}
                line={line}
                last={index === state.lines.length - 1}
                onAct={onAct}
              />
            ))
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 6, marginTop: 34 },
  sticker: { position: 'absolute', right: -8, top: -34 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingBottom: 4 },
  titleRight: { paddingRight: 60 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  icon: { width: 32, alignItems: 'center' },
  text: { flex: 1, lineHeight: 19 },
  chip: { height: 30, paddingHorizontal: 12, justifyContent: 'center' },
  loading: { gap: 10, paddingVertical: 12 },
  none: { paddingVertical: 10 },
  failed: { gap: 6, paddingBottom: 12 },
});
