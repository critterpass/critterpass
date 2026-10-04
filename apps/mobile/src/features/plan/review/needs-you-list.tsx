/**
 * NEEDS YOU on the review (7h-7): the ideas Tokek left for the person, each with why ("The crew is
 * split 2–2", "Only fits if Wednesday's lunch moves") and SEE: the crew split or the place, or
 * (a stop would have to move) a line under the row saying what to do (undesigned).
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface NeedsYouRow {
  readonly key: string;
  readonly name: string;
  readonly line: string;
  /** Shown under the row once SEE is tapped (a stop that would have to move). */
  readonly explainer: string | null;
  readonly onSee: () => void;
}

const useStyles = makeStyles((th) => ({
  card: { borderRadius: th.radius.lg, backgroundColor: th.semantic.bg.raised },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
  },
  body: { flex: 1, minWidth: 0 },
  explain: { paddingHorizontal: th.space['14'], paddingBottom: th.space['10'] },
  see: {
    borderRadius: th.radius.xl,
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['6'],
    backgroundColor: th.semantic.bg.control,
  },
}));

export function NeedsYouList({ rows }: { readonly rows: readonly NeedsYouRow[] }) {
  const styles = useStyles();
  const theme = useTheme();
  if (rows.length === 0) return null;
  const see = t({ id: 'plan.review.see', message: 'SEE' });
  return (
    <>
      <Text variant="eyebrow" color={theme.semantic.state.urgent}>
        {t({ id: 'plan.review.needsYou', message: 'NEEDS YOU' })}
      </Text>
      <View style={styles.card} testID="plan-review-needs-you">
        {rows.map((row) => (
          <View key={row.key}>
            <View style={styles.row}>
              <View style={styles.body}>
                <Text variant="title" numberOfLines={1}>
                  {row.name}
                </Text>
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {row.line}
                </Text>
              </View>
              <PressScale
                widthClass="narrow"
                accessibilityRole="button"
                accessibilityLabel={`${see} ${row.name}`}
                onPress={row.onSee}
                testID={`plan-review-see-${row.key}`}
              >
                <View style={styles.see}>
                  <Text variant="label" color={theme.semantic.action.primary}>
                    {see}
                  </Text>
                </View>
              </PressScale>
            </View>
            {row.explainer === null ? null : (
              <View style={styles.explain}>
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {row.explainer}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </>
  );
}
