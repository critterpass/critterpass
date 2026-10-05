/**
 * Which must-dos made the draft: "✓ ALL 5 MUST-DOS MADE IT" with their owners' avatars, or
 * "3 OF 5 MADE IT" with a line per missing one saying whose it is and why it did not fit, and the
 * one thing to do about it (pick the place it meant, or ask for a day to be changed around it). An
 * over-budget draft adds how far over the locked target it is, per person. And the essential
 * places of the destination the draft does not hold, each with why.
 */
import { plural, t } from '@lingui/core/macro';
import type { MustDoMissReason } from '@cp/domain';
import { View } from 'react-native';

import { TextLink } from '@/ui/buttons/TextLink';
import { Icon } from '@/ui/icons/Icon';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { LeftOut } from '../data/left-out';
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
  missing: { paddingStart: MARK + th.space['10'], gap: th.space['8'] },
  miss: { gap: th.space['2'], alignItems: 'flex-start' },
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

export type MissedMustDo = ReviewModel['mustDos']['missing'][number];

/* eslint-disable lingui/no-unlocalized-strings -- action keys, never copy. */
/** What the organiser can do about a must-do that did not make it; null when nothing helps. */
export function missAction(reason: MustDoMissReason): 'pick_place' | 'change_day' | null {
  switch (reason) {
    case 'unknown_place':
      return 'pick_place';
    case 'no_time':
    case 'dropped':
      return 'change_day';
    case 'closed':
      return null;
  }
}
/* eslint-enable lingui/no-unlocalized-strings */

export function CoverageStrip({
  model,
  onFix,
}: {
  readonly model: ReviewModel['mustDos'];
  /** Opens the way to fix one missing must-do (see `missAction`). */
  readonly onFix?: ((miss: MissedMustDo) => void) | undefined;
}) {
  const styles = useStyles();
  const theme = useTheme();
  if (model.total === 0) return null;
  const all = model.missing.length === 0;
  const total = model.total;
  const made = model.made;
  const headline = all
    ? t({
        id: 'planDraft.coverage.all',
        message: plural(total, { one: 'Your must-do made it', other: 'All # must-dos made it' }),
      })
    : t({
        id: 'planDraft.coverage.some',
        message: plural(total, {
          one: `${made} of # must-do made it`,
          other: `${made} of # must-dos made it`,
        }),
      });
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
            const action = onFix === undefined ? null : missAction(miss.reason);
            return (
              <View key={`${title}-${index}`} style={styles.miss}>
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {t({
                    id: 'planDraft.coverage.missing',
                    message: `${title} (${owner}): ${reason}`,
                  })}
                </Text>
                {action === null ? null : (
                  <TextLink
                    label={
                      action === 'pick_place'
                        ? t({ id: 'planDraft.coverage.pickPlace', message: 'Pick the place' })
                        : t({ id: 'planDraft.coverage.fitIn', message: 'Change a day to fit it' })
                    }
                    onPress={() => onFix?.(miss)}
                    testID={`draft-miss-fix-${index}`}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** Why an essential place is not in the draft, in the guide's words; null for a reason unknown here. */
export function leftOutWhy(reason: string): string | null {
  switch (reason) {
    case 'no_room':
      return t({ id: 'planDraft.leftOut.noRoom', message: 'No room in the days.' });
    case 'held_in_the_way':
      return t({ id: 'planDraft.leftOut.held', message: 'No room around your stops.' });
    case 'closed':
      return t({ id: 'planDraft.leftOut.closed', message: 'Closed on your dates.' });
    case 'too_far':
      return t({ id: 'planDraft.leftOut.tooFar', message: 'Too far for a day of this trip.' });
    case 'not_offered':
      return t({ id: 'planDraft.leftOut.notOffered', message: 'I didn’t get to consider it.' });
    default:
      return null;
  }
}

/**
 * The destination's essential places this draft does not hold, one line each with why ("Left out:
 * Langbiang. No room around your stops."); on a redraft, the ones it took out (`takenOut`).
 */
export function LeftOutRows({
  rows,
  takenOut = false,
}: {
  readonly rows: readonly LeftOut[];
  readonly takenOut?: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  if (rows.length === 0) return null;
  return (
    <View style={styles.card} testID="draft-left-out">
      {rows.map((row) => {
        const name = row.name;
        const why = takenOut ? null : leftOutWhy(row.reason);
        const line = takenOut
          ? t({ id: 'planDraft.leftOut.takenOut', message: `Taken out of the trip: ${name}` })
          : t({ id: 'planDraft.leftOut.line', message: `Left out: ${name}.` });
        return (
          <Text key={row.poiId} variant="bodySm" color={theme.semantic.text.secondary}>
            {why === null ? line : `${line} ${why}`}
          </Text>
        );
      })}
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
