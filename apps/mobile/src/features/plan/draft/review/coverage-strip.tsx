/**
 * Which must-dos made the draft: "✓ ALL 5 MUST-DOS MADE IT" with their owners' avatars, or
 * "3 OF 5 MADE IT" with a line per missing one saying whose it is and why it did not fit. An
 * over-budget draft adds how far over the locked target it is, per person.
 */
import { t } from '@lingui/core/macro';
import type { MustDoMissReason } from '@cp/domain';
import { View } from 'react-native';

import { Icon } from '@/ui/icons/Icon';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { ReviewModel } from '../data/version';

const MARK = 22;

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['12'],
    gap: th.space['8'],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: th.space['10'] },
  grow: { flex: 1 },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missing: { paddingStart: MARK + th.space['10'], gap: th.space['4'] },
}));

function why(reason: MustDoMissReason): string {
  switch (reason) {
    case 'closed':
      return t({ id: 'planDraft.miss.closed', message: 'closed on your dates' });
    case 'no_time':
      return t({ id: 'planDraft.miss.noTime', message: 'no room in the days' });
    case 'unknown_place':
      return t({ id: 'planDraft.miss.unknown', message: 'I couldn’t find the place' });
    case 'dropped':
      return t({ id: 'planDraft.miss.dropped', message: 'it broke the day around it' });
  }
}

export function CoverageStrip({ model }: { readonly model: ReviewModel['mustDos'] }) {
  const styles = useStyles();
  const theme = useTheme();
  if (model.total === 0) return null;
  const all = model.missing.length === 0;
  const total = model.total;
  const made = model.made;
  const headline = all
    ? t({ id: 'planDraft.coverage.all', message: `All ${total} must-dos made it` })
    : t({ id: 'planDraft.coverage.some', message: `${made} of ${total} must-dos made it` });
  const colour = all ? theme.semantic.state.success : theme.semantic.state.warning;
  return (
    <View style={styles.card} testID="draft-coverage">
      <View style={styles.row}>
        <View style={[styles.mark, { backgroundColor: colour }]}>
          {all ? (
            <Icon name="check" size={14} color={theme.semantic.text.onAccent} decorative />
          ) : (
            <Text variant="label" color={theme.semantic.text.onAccent}>
              !
            </Text>
          )}
        </View>
        <View style={styles.grow}>
          <Text variant="label" color={colour}>
            {headline}
          </Text>
        </View>
        <AvatarStack
          members={model.owners.map((p) => ({ key: p.uid, name: p.name, joinIndex: p.joinIndex }))}
          size="sm"
          max={6}
        />
      </View>
      {all ? null : (
        <View style={styles.missing}>
          {model.missing.map((miss, index) => {
            const title = miss.title;
            const owner = miss.owner?.name ?? '';
            const reason = why(miss.reason);
            return (
              <Text
                key={`${title}-${index}`}
                variant="bodySm"
                color={theme.semantic.text.secondary}
              >
                {t({ id: 'planDraft.coverage.missing', message: `${title} (${owner}): ${reason}` })}
              </Text>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function OverBudget({ amount }: { readonly amount: string }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={[styles.card, styles.row]} testID="draft-over-budget">
      <View style={[styles.mark, { backgroundColor: theme.semantic.state.warning }]}>
        <Text variant="label" color={theme.semantic.text.onAccent}>
          $
        </Text>
      </View>
      <View style={styles.grow}>
        <Text variant="bodySm">
          {t({
            id: 'planDraft.overBudget',
            message: `Over the budget by ${amount} each. Ask me for a cheaper day.`,
          })}
        </Text>
      </View>
    </View>
  );
}
