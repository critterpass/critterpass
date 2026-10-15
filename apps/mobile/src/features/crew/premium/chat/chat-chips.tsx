/**
 * The chat's small pieces (5.03, 5.12): the NO SIGNAL chip, a system line as a centred pill, the
 * offline marker, the counted "New messages" pill and the settled strip ("All square").
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import {
  Avatar,
  CritterSticker,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

const useStyles = makePremiumStyles((th) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap6,
    height: 30,
    paddingHorizontal: th.space.gap10,
    borderRadius: 15,
    backgroundColor: th.color.segmentTrack,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: th.signal.offlineDot },
  faces: { flexDirection: 'row' },
  overlap: { marginStart: -6 },
  pillText: { flexShrink: 1 },
  pill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap6,
    paddingVertical: th.space.gap4,
    paddingStart: th.space.gap4,
    paddingEnd: th.space.gap10,
    borderRadius: 14,
    backgroundColor: th.color.segmentTrack,
    maxWidth: '86%',
  },
  marker: {
    alignSelf: 'center',
    paddingVertical: 5,
    paddingHorizontal: th.space.gap12,
    borderRadius: th.radius.statusTag,
    backgroundColor: th.color.status.tangerine.bg,
  },
  newPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap6,
    height: th.size.pillSmall,
    paddingStart: th.space.gap8,
    paddingEnd: th.space.gap12,
    borderRadius: th.radius.pillSmall,
    backgroundColor: th.color.inkSurface,
    boxShadow: th.shadow.toast,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.accent.pink,
  },
  settled: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap8,
    paddingVertical: th.space.gap8,
    paddingStart: th.space.gap8,
    paddingEnd: th.space.gap14,
    borderRadius: th.radius.cardRow,
    backgroundColor: th.color.banner.success.bg,
  },
}));

export function NoSignalChip() {
  const th = usePremiumTheme();
  const styles = useStyles();
  return (
    <View style={styles.chip} testID="chat-no-signal">
      <View style={styles.dot} />
      <Text variant="helper" color={th.color.status.tangerine.text}>
        {t({ id: 'chat.premium.noSignal', message: 'NO SIGNAL' })}
      </Text>
    </View>
  );
}

export interface PillFace {
  readonly who: string;
  readonly uid: string | null;
  readonly color: string;
}

export function SystemPill({
  text,
  who,
  uid,
  color,
  faces,
  onPress,
}: {
  readonly text: string;
  readonly who: string | null;
  /** The named member's user id, for their face. */
  readonly uid?: string | null;
  readonly color: string;
  /** Several members on one line (joins in a row): their faces overlap, in place of one. */
  readonly faces?: readonly PillFace[];
  readonly onPress?: () => void;
}) {
  const styles = useStyles();
  return (
    <PressableScale
      style={styles.pill}
      disabled={onPress === undefined}
      onPress={onPress}
      accessibilityRole={onPress === undefined ? 'text' : 'button'}
      accessibilityLabel={text}
    >
      {faces !== undefined ? (
        <View style={styles.faces}>
          {faces.slice(0, MAX_FACES).map((face, index) => (
            <View key={face.uid ?? String(index)} style={index === 0 ? null : styles.overlap}>
              <Avatar name={face.who} color={face.color} uid={face.uid} size={20} />
            </View>
          ))}
        </View>
      ) : who === null ? null : (
        <Avatar name={who} color={color} uid={uid} size={20} />
      )}
      <Text variant="captionMuted" tone="inkSecondary" numberOfLines={2} style={styles.pillText}>
        {text}
      </Text>
    </PressableScale>
  );
}

/** A joined line shows at most this many faces; the names still list everyone. */
const MAX_FACES = 4;

export function OfflineMarker() {
  const th = usePremiumTheme();
  const styles = useStyles();
  return (
    <View style={styles.marker} testID="chat-offline-marker">
      <Text variant="helper" color={th.color.status.tangerine.text}>
        {t({ id: 'chat.premium.offlineMarker', message: 'Offline · sends when you’re back' })}
      </Text>
    </View>
  );
}

export function NewMessagesPill({
  count,
  onPress,
}: {
  readonly count: number;
  readonly onPress: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const label =
    count > 0
      ? t({ id: 'chat.premium.newMessages', message: 'New messages ↓' })
      : t({ id: 'chat.list.jumpToLatest', message: 'Jump to latest' });
  return (
    <PressableScale
      style={styles.newPill}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${count} ${label}` : label}
      testID="chat-jump-latest"
    >
      {count > 0 ? (
        <View style={styles.badge}>
          <Text variant="tier" color={th.color.onAccent}>
            {count > 99 ? '99+' : String(count)}
          </Text>
        </View>
      ) : null}
      <Text variant="label" color={th.color.onInkSurface}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function SettledStrip({
  tripName,
  settled,
  onPress,
}: {
  readonly tripName: string | null;
  readonly settled: number;
  readonly onPress?: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const place = tripName ?? t({ id: 'chat.premium.settled.trip', message: 'The trip' });
  return (
    <PressableScale
      style={styles.settled}
      disabled={onPress === undefined}
      onPress={onPress}
      accessibilityRole="button"
      testID="chat-settled"
    >
      <CritterSticker kind="gecko" name="Tokek" size={40} pose="cheer" />
      <View>
        <Text variant="rowTextStrong" color={th.color.banner.success.text}>
          {t({ id: 'chat.premium.settled.title', message: 'All square' })}
        </Text>
        <Text variant="captionMuted" color={th.color.status.booked.text}>
          {t({
            id: 'chat.premium.settled.line',
            message: `${place} is settled · ${settled} of ${settled}`,
          })}
        </Text>
      </View>
    </PressableScale>
  );
}
