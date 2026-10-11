/**
 * The plan map's top chrome (4.25, 4.26): the glass back, the search pill with the guide in it
 * ("Search Bali, or ask Tokek"), and the plan's ⋯ menu (the way into Ideas, the places list, all
 * days, sharing and the trip's settings). At peek the filter chips sit under it; at full the
 * chrome steps away for the island strip.
 */
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CritterSticker,
  GlassIconButton,
  GlassSurface,
  Icon,
  makePremiumStyles,
  PressableScale,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { dayColours } from '../map';

export interface FilterChip {
  readonly key: string;
  readonly label: string;
  readonly count?: number;
  readonly selected: boolean;
  /** The day chip carries its day's dot. */
  readonly dayNo?: number;
}

export interface TopBarProps {
  readonly placeholder: string;
  readonly guide: { readonly kind: string; readonly name: string };
  readonly labels: { readonly back: string; readonly more: string };
  readonly chips: readonly FilterChip[] | null;
  readonly onBack: () => void;
  readonly onSearch: () => void;
  readonly onMore: (anchorY: number) => void;
  readonly onChip: (key: string) => void;
}

const useStyles = makePremiumStyles((t) => ({
  bar: {
    position: 'absolute',
    left: t.space.gap16,
    right: t.space.gap16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.gap8,
  },
  pill: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: t.space.gap16,
    paddingEnd: t.space.gap6,
    gap: t.space.gap8,
  },
  pillText: { flex: 1 },
  guide: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.color.status.maybe.bg,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chips: { gap: t.space.gap6, paddingHorizontal: t.space.gap16 },
  chip: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.gap6,
  },
  chipOn: { backgroundColor: t.color.inkSurface },
  dot: { width: 8, height: 8, borderRadius: 4 },
}));

export function TopBar(props: TopBarProps) {
  const styles = useStyles();
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const top = insets.top + 2;
  return (
    <>
      <View style={[styles.bar, { top }]}>
        <GlassIconButton
          icon="back"
          label={props.labels.back}
          onPress={props.onBack}
          testID="plan-map-back"
        />
        <PressableScale
          onPress={props.onSearch}
          accessibilityRole="search"
          accessibilityLabel={props.placeholder}
          testID="plan-map-search"
          style={{ flex: 1 }}
        >
          <GlassSurface kind="nav" interactive style={styles.pill}>
            <Icon name="pin" size={17} color={t.color.muted} />
            <Text variant="body" tone="inkSecondary" numberOfLines={1} style={styles.pillText}>
              {props.placeholder}
            </Text>
            <View style={styles.guide}>
              <CritterSticker
                kind={props.guide.kind}
                name={props.guide.name}
                size={34}
                pose="point"
              />
            </View>
          </GlassSurface>
        </PressableScale>
        <GlassIconButton
          icon="more"
          label={props.labels.more}
          onPress={() => props.onMore(top + 52)}
          testID="plan-map-more"
        />
      </View>
      {props.chips === null ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ position: 'absolute', left: 0, right: 0, top: top + 58 }}
          contentContainerStyle={styles.chips}
        >
          {props.chips.map((chip) => (
            <PressableScale
              key={chip.key}
              onPress={() => props.onChip(chip.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: chip.selected }}
              accessibilityLabel={chip.label}
              testID={`plan-map-chip-${chip.key}`}
            >
              {chip.selected ? (
                <View style={[styles.chip, styles.chipOn]}>
                  <ChipBody chip={chip} on />
                </View>
              ) : (
                <GlassSurface kind="nav" style={styles.chip}>
                  <ChipBody chip={chip} on={false} />
                </GlassSurface>
              )}
            </PressableScale>
          ))}
        </ScrollView>
      )}
    </>
  );
}

function ChipBody({ chip, on }: { readonly chip: FilterChip; readonly on: boolean }) {
  const styles = useStyles();
  return (
    <>
      {chip.dayNo === undefined ? null : (
        <View style={[styles.dot, { backgroundColor: dayColours(chip.dayNo).fill }]} />
      )}
      <Text variant="segment" tone={on ? 'onInk' : 'ink'} numberOfLines={1}>
        {chip.count === undefined ? chip.label : `${chip.label} ${String(chip.count)}`}
      </Text>
    </>
  );
}
