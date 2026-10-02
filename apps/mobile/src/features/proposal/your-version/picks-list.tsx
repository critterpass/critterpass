/**
 * The version's picks (3f-3): colour cards that slide in one by one, each with its stop, its day
 * and time, and the reason tag stamped on the right. Tapping one opens why it's there.
 */
import { t } from '@lingui/core/macro';
import { Pressable, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Icon } from '@/ui/icons/Icon';
import type { DoodleName } from '@/ui/icons/generated';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { reasonLabel, type Pick } from '../data/picks';

const useStyles = makeStyles((th) => ({
  list: { gap: th.space['8'] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['10'],
    borderRadius: th.radius.lg,
    padding: th.space['14'],
  },
  grow: { flex: 1, gap: th.space['2'] },
  tag: {
    backgroundColor: th.semantic.bg.base,
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['6'],
    maxWidth: 120,
  },
}));

/** The doodle for a stop's kind (the plan's item categories); a pin when the kind has none. */
export function kindIcon(category: string | null): DoodleName {
  switch (category) {
    case 'food':
    case 'drink':
    case 'cafe':
      return 'food';
    case 'stay':
    case 'rest':
      return 'bed';
    case 'beach':
    case 'nature':
    case 'outdoor':
      return 'sun';
    case 'transfer':
    case 'transport':
      return 'car';
    case 'flight':
      return 'plane';
    case 'sight':
    case 'culture':
      return 'temple';
    case 'activity':
    case 'tour':
      return 'ticket';
    case null:
    default:
      return 'pin';
  }
}

export interface PicksListProps {
  readonly picks: readonly Pick[];
  /** "Day 1 · 17:00" for a pick. */
  readonly when: (pick: Pick) => string;
  readonly onOpen: (pick: Pick) => void;
}

export function PicksList({ picks, when, onOpen }: PicksListProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const fills = [theme.color.pink, theme.color.yellow, theme.color.green.base];
  const ink = theme.semantic.text.onAccent;
  return (
    <View style={styles.list} testID="version-picks">
      {picks.map((pick, index) => {
        const tag = pick.reasonLabel ?? reasonLabel(pick.reasonTag, pick.dayNo);
        const line = when(pick);
        return (
          <Animated.View
            key={pick.itemId}
            {...(reduced ? {} : { entering: FadeInRight.delay(120 * index).springify() })}
          >
            <Pressable
              style={[styles.card, { backgroundColor: fills[index % fills.length] }]}
              onPress={() => onOpen(pick)}
              accessibilityRole="button"
              accessibilityLabel={t({
                id: 'proposal.version.pickA11y',
                message: `${pick.title}, ${tag}. Why it’s there`,
              })}
              testID={`version-pick-${index}`}
            >
              <Icon name={kindIcon(pick.category)} size={28} color={ink} decorative />
              <View style={styles.grow}>
                <Text variant="title" color={ink} numberOfLines={2}>
                  {pick.title.toUpperCase()}
                </Text>
                {line === '' ? null : (
                  <Text variant="bodySm" color={ink}>
                    {line}
                  </Text>
                )}
              </View>
              <View style={styles.tag}>
                <Text variant="label" color={fills[index % fills.length]} singleLine={false}>
                  {tag}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}
