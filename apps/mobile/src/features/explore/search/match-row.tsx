/**
 * One place the import found (7d-3): a sure match with its tick and SAVE ✓, a mention with more
 * than one candidate in orange with PICK ONE, or one it could not find with a search for it.
 * Places tick in as they arrive (a short rise and fade; still under reduced motion).
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useMotionMode } from '@/motion/motion-mode';
import { makeStyles, Text, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { PressScale } from '@/ui/press/PressScale';

import type { LinkMatch } from './link-import-model';

const TICK = '✓';
const ASK = '?';
const NONE = '·';

const useStyles = makeStyles((th) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    paddingVertical: th.space['12'],
    paddingHorizontal: th.space['14'],
  },
  disc: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: th.space['2'] },
  save: {
    minHeight: 44,
    justifyContent: 'center',
  },
  savePill: {
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
    borderRadius: th.radius.sm,
    borderWidth: 1.5,
  },
}));

export interface MatchRowProps {
  readonly match: LinkMatch;
  readonly selected: boolean;
  /** "Waterfall" for the place's category. */
  readonly kindWord: (category: string) => string;
  readonly onToggle: () => void;
  readonly onPick: () => void;
  readonly onSearch: () => void;
  readonly index: number;
}

export function MatchRow({
  match,
  selected,
  kindWord,
  onToggle,
  onPick,
  onSearch,
  index,
}: MatchRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [motionMode] = useMotionMode();
  const place =
    match.kind === 'sure' ? match.place : match.kind === 'ambiguous' ? match.picked : null;
  const tone =
    place !== null
      ? tokens.color.green.base
      : match.kind === 'ambiguous'
        ? tokens.color.orange
        : theme.semantic.bg.control;
  const title = place?.name ?? `“${match.label}”`;
  const meta =
    place !== null
      ? [kindWord(place.category), place.meta]
          .filter((part) => part !== null && part !== '')
          .join(' · ')
      : match.kind === 'ambiguous'
        ? couldBe(match.candidates.length, match.candidates[0]?.meta ?? null)
        : t({ id: 'search.link.notFound', message: 'Couldn’t find it' });
  const end =
    place !== null ? (
      <PressScale
        widthClass="narrow"
        accessibilityRole="switch"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={t({ id: 'search.link.saveToggle', message: 'Save' })}
        onPress={onToggle}
        style={styles.save}
        testID={`search-link-save-${String(index)}`}
      >
        <View
          style={[
            styles.savePill,
            {
              borderColor: tokens.color.green.base,
              backgroundColor: selected ? tokens.color.green.base : 'transparent',
            },
          ]}
        >
          <Text
            variant="label"
            color={selected ? theme.semantic.text.onAccent : tokens.color.green.base}
          >
            {selected
              ? t({ id: 'search.link.saved', message: 'Save ✓' })
              : t({ id: 'search.link.save', message: 'Save' })}
          </Text>
        </View>
      </PressScale>
    ) : match.kind === 'ambiguous' ? (
      <PillButton
        label={t({ id: 'search.link.pickOne', message: 'Pick one' })}
        size="sm"
        tone="ink"
        onPress={onPick}
        testID={`search-link-pick-${String(index)}`}
      />
    ) : (
      <TextLink label={t({ id: 'search.link.search', message: 'Search' })} onPress={onSearch} />
    );
  return (
    <Animated.View
      {...(motionMode === 'full'
        ? { entering: FadeInDown.duration(theme.motion.duration.base) }
        : {})}
      style={styles.row}
      testID={`search-link-match-${String(index)}`}
    >
      <View style={[styles.disc, { backgroundColor: tone }]}>
        <Text variant="label" color={theme.semantic.text.onAccent}>
          {place !== null ? TICK : match.kind === 'ambiguous' ? ASK : NONE}
        </Text>
      </View>
      <View style={styles.body}>
        <Text variant="title" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={2}>
          {meta}
        </Text>
      </View>
      {end}
    </Animated.View>
  );
}

function couldBe(count: number, area: string | null): string {
  return area === null
    ? t({ id: 'search.link.couldBe', message: `Could be one of ${count} places` })
    : t({ id: 'search.link.couldBeNear', message: `Could be one of ${count} places near ${area}` });
}
