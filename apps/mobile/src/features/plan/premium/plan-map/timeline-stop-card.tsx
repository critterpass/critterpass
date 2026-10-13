/** One stop on the day's timeline: its number disc in the day's colour, title, meta, booked tag. */
import { View } from 'react-native';

import {
  Icon,
  makePremiumStyles,
  PressableScale,
  StatusTag,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { dayColours } from '../map';

export interface TimelineRow {
  readonly id: string;
  readonly n: number;
  readonly time: string;
  readonly title: string;
  readonly meta: string | null;
  readonly booked: boolean;
  /** The leg to the next stop ("Walk · 6 min"). */
  readonly legAfter: string | null;
}

export interface StopCardLabels {
  readonly booked: string;
  readonly menu: string;
}

const useStyles = makePremiumStyles((t) => ({
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.gap10,
    backgroundColor: t.color.card,
    borderRadius: t.radius.field,
    paddingVertical: t.space.rowPadV,
    paddingHorizontal: t.space.gap12,
    boxShadow: t.shadow.card,
  },
  disc: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: t.color.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
}));

export function StopCard({
  row,
  dayNo,
  labels,
  onOpenMenu,
}: {
  readonly row: TimelineRow;
  readonly dayNo: number;
  readonly labels: StopCardLabels;
  readonly onOpenMenu: (id: string) => void;
}) {
  const styles = useStyles();
  const t = usePremiumTheme();
  return (
    <View style={styles.card}>
      <View style={[styles.disc, { backgroundColor: dayColours(dayNo).fill }]}>
        <Text variant="tier" tone="onAccent">
          {String(row.n)}
        </Text>
      </View>
      <View style={styles.body}>
        <Text variant="rowTitle" numberOfLines={1}>
          {row.title}
        </Text>
        {row.meta === null ? null : (
          <Text variant="captionMuted" tone="muted" numberOfLines={1}>
            {row.meta}
          </Text>
        )}
      </View>
      {row.booked ? <StatusTag label={labels.booked} tone="booked" /> : null}
      <PressableScale
        onPress={() => onOpenMenu(row.id)}
        accessibilityRole="button"
        accessibilityLabel={labels.menu}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        testID={`stop-menu-${row.id}`}
      >
        <Icon name="more" size={18} color={t.color.muted} />
      </PressableScale>
    </View>
  );
}
