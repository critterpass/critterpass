/**
 * The version's picks in the premium look (undesigned; a list card): each stop with its day and
 * time and the reason as a tag, the rows rising in one after another. Tapping one opens why it's
 * there.
 */
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  ListCard,
  PressableScale,
  Tag,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import type { PicksListProps } from '../../your-version/version-model';
import { riseIn } from '../entrances';

/** One crew colour per row, in turn, so the list reads like the version's colour cards. */
const DOTS = ['pink', 'sun', 'mint', 'sky', 'tangerine'] as const;

export function PremiumPicksList({ picks, when, tag: tagOf, onOpen }: PicksListProps) {
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  return (
    <ListCard testID="version-picks">
      {picks.map((pick, index) => {
        const tag = tagOf(pick);
        const line = when(pick);
        return (
          <Animated.View
            key={pick.itemId}
            {...(reduced ? {} : { entering: riseIn(false, 'smooth', 80 * index) })}
          >
            <PressableScale
              onPress={() => onOpen(pick)}
              accessibilityRole="button"
              accessibilityLabel={t({
                id: 'proposal.version.pickA11y',
                message: `${pick.title}, ${tag}. Why it’s there`,
              })}
              testID={`version-pick-${index}`}
              style={[
                styles.row,
                { paddingHorizontal: theme.space.rowPadH, gap: theme.space.gap12 },
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: theme.color.hairline,
                },
              ]}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: theme.accent[DOTS[index % DOTS.length] ?? 'sun'] },
                ]}
              />
              <View style={styles.grow}>
                <Text variant="rowTextStrong" numberOfLines={2}>
                  {pick.title}
                </Text>
                {line === '' ? null : (
                  <Text variant="captionMuted" tone="muted">
                    {line}
                  </Text>
                )}
              </View>
              {tag === '' ? null : (
                <View style={styles.tag}>
                  <Tag label={tag} />
                </View>
              )}
            </PressableScale>
          </Animated.View>
        );
      })}
    </ListCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  grow: { flex: 1, gap: 2 },
  tag: { maxWidth: 130 },
});
