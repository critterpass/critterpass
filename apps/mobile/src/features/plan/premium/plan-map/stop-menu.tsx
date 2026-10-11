/**
 * A stop's menu (4.29): the stop lifted as a card (its day's colour bar, title, time and how it is
 * reached, its booking) over the dimmed day, and the glass menu under it: see the details, move it
 * to another day, change its time, ask the guide, share it, and remove it from the plan (pink, set
 * apart). A member's moves and removals go to the crew as suggestions, as every edit of theirs does.
 */
import { useWindowDimensions, View } from 'react-native';

import { makePremiumStyles, StatusTag, Text } from '@/ui/premium';

import { dayColours } from '../map';
import { planMapCopy } from './copy';
import { GlassMenu, type GlassMenuItem } from './glass-menu';

export interface StopMenuStop {
  readonly id: string;
  readonly dayNo: number;
  readonly title: string;
  readonly line: string | null;
  readonly booked: boolean;
  readonly leg: string | null;
}

export interface StopMenuProps {
  readonly stop: StopMenuStop;
  readonly guideName: string;
  readonly onClose: () => void;
  readonly onDetails: () => void;
  readonly onMove: () => void;
  readonly onTime: () => void;
  readonly onAsk: (() => void) | undefined;
  readonly onShare: () => void;
  readonly onRemove: (() => void) | undefined;
}

const PREVIEW_TOP = 170;

const useStyles = makePremiumStyles((t) => ({
  card: {
    backgroundColor: t.color.card,
    borderRadius: t.radius.banner,
    padding: t.space.gap14,
    paddingHorizontal: t.space.gap16,
    flexDirection: 'row',
    gap: t.space.gap12,
    boxShadow: t.shadow.float,
    transform: [{ scale: 1.03 }],
  },
  bar: { width: 4, borderRadius: 2 },
  body: { flex: 1, gap: t.space.gap4 },
  tags: { flexDirection: 'row', gap: t.space.gap6, marginTop: t.space.gap8 },
}));

export function StopMenu(props: StopMenuProps) {
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const { stop } = props;
  const copy = planMapCopy.stop;
  const items: GlassMenuItem[] = [
    { key: 'details', label: copy.details(), icon: 'forward', onPress: props.onDetails },
    { key: 'move', label: copy.move(), icon: 'expand', onPress: props.onMove },
    { key: 'time', label: copy.time(), icon: 'edit', onPress: props.onTime },
    ...(props.onAsk === undefined
      ? []
      : [
          {
            key: 'ask',
            label: copy.ask(props.guideName),
            icon: 'mic' as const,
            onPress: props.onAsk,
          },
        ]),
    { key: 'share', label: copy.share(), icon: 'share', onPress: props.onShare },
    ...(props.onRemove === undefined
      ? []
      : [{ key: 'remove', label: copy.remove(), destructive: true, onPress: props.onRemove }]),
  ];
  return (
    <GlassMenu
      items={items}
      onClose={props.onClose}
      anchor={{ x: 20, y: PREVIEW_TOP }}
      accessibilityLabel={planMapCopy.closeMenu()}
      testID="stop-menu"
      preview={
        <View
          style={[styles.card, { width: width - 40 }]}
          accessible
          accessibilityLabel={stop.title}
        >
          <View style={[styles.bar, { backgroundColor: dayColours(stop.dayNo).fill }]} />
          <View style={styles.body}>
            <Text variant="headline" numberOfLines={2}>
              {stop.title}
            </Text>
            {stop.line === null ? null : (
              <Text variant="label" tone="muted" numberOfLines={1}>
                {stop.line}
              </Text>
            )}
            {stop.booked || stop.leg !== null ? (
              <View style={styles.tags}>
                {stop.booked ? <StatusTag label={planMapCopy.booked()} tone="booked" /> : null}
                {stop.leg === null ? null : <StatusTag label={stop.leg} tone="unopened" />}
              </View>
            ) : null}
          </View>
        </View>
      }
    />
  );
}
