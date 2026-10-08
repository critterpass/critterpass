/**
 * The review panel under the scanned receipt (3i-3): "TOKEK READ 3 LINES", one row per line with
 * who had it (avatars sliding in one after another) and its chip (NOT JORDAN / EVERYONE / BY
 * SHARE), the per-person result ("Jordan pays $1.50 · Everyone else $13.34"), and SPLIT IT · MAYA
 * PAID. A total mismatch shows a banner with KEEP TOTAL.
 */
import { upper } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { BAR_GROW_STAGGER_MS } from '@/motion/patterns/bar-grow';
import { staggerDelayMs, useReducedImpactMotion } from '@/motion/patterns/shared';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Toggle } from '@/ui/inputs/Toggle';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';
import { useWalletGuide } from '@/features/bookings';

import type { MoneyMember } from '../data/context';

const useStyles = makeStyles((t) => ({
  panel: {
    backgroundColor: t.semantic.bg.base,
    borderTopStartRadius: t.radius.sheetTop,
    borderTopEndRadius: t.radius.sheetTop,
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['20'],
    gap: t.space['12'],
  },
  row: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space['14'],
    minHeight: MIN_TOUCH_TARGET + t.space['4'],
    alignItems: 'center',
    gap: t.space['8'],
  },
  lines: { gap: t.space['12'] },
  check: { borderWidth: t.space['2'], borderColor: t.semantic.state.warning },
  label: { flex: 1 },
  chip: {
    borderRadius: t.space['12'],
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
  },
}));

/** The share of the screen the lines may take before they scroll. */
const LINES_MAX_SHARE = 0.45;

export interface ReviewRow {
  readonly lineId: string;
  readonly label: string;
  /** The amount read, shown when the line is one to check against the paper. */
  readonly check: string | null;
  /** Who had it; null = everyone. Non-item lines are shared by share. */
  readonly assignees: readonly MoneyMember[] | null;
  readonly chip: { readonly text: string; readonly tone: 'pink' | 'plain' };
  readonly byShare: boolean;
}

export interface LineAssignSheetProps {
  readonly rows: readonly ReviewRow[];
  readonly members: readonly MoneyMember[];
  /** "Jordan pays $1.50", "Everyone else $13.34". */
  readonly summary: readonly { readonly who: string; readonly amount: string }[];
  readonly payerName: string;
  readonly mismatch: { readonly text: string; readonly keep: boolean } | null;
  /** Retype the lines from what was read, offered while the lines miss the total. */
  readonly onFix?: () => void;
  readonly committing: boolean;
  readonly onLine: (lineId: string) => void;
  readonly onKeepTotal: (keep: boolean) => void;
  readonly onPayer: () => void;
  readonly onCommit: () => void;
}

export function LineAssignSheet(props: LineAssignSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const reduced = useReducedImpactMotion();
  const { t } = useLingui();
  const { name: guideName } = useWalletGuide();
  const guide = useWalletGuide();
  const tokek = guideSticker(guide.id);
  const count = props.rows.length;
  const payer = props.payerName;
  // A long bill scrolls its lines; who pays and SPLIT IT stay on screen under them.
  const { height } = useWindowDimensions();
  return (
    <View
      style={[styles.panel, { paddingBottom: insets.bottom + theme.space['8'] }]}
      testID="money-review"
    >
      <Row gap="12" align="center">
        <Sticker kind={tokek.kind} name={guide.name} size={44} pose="point" />
        <Stack gap="2" style={{ flex: 1 }}>
          <Text variant="h3" accessibilityRole="header">
            {upper(
              t({
                id: 'money.review.title',
                message: plural(count, {
                  one: `${guideName} read # line`,
                  other: `${guideName} read # lines`,
                }),
              }),
              locale,
            )}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {t({ id: 'money.review.hint', message: 'Tap a line to change who had it.' })}
          </Text>
        </Stack>
      </Row>
      <ScrollView
        style={{ maxHeight: height * LINES_MAX_SHARE }}
        contentContainerStyle={styles.lines}
        testID="money-review-lines"
      >
        {props.rows.map((row, index) => (
          <Pressable
            key={row.lineId}
            onPress={() => props.onLine(row.lineId)}
            disabled={row.byShare}
            accessibilityRole="button"
            accessibilityLabel={[row.label, row.check, row.chip.text]
              .filter((part) => part !== null)
              .join(', ')}
            testID={`money-review-line-${row.lineId}`}
          >
            <Row style={[styles.row, row.check === null ? null : styles.check]}>
              <Stack gap="2" style={styles.label}>
                <Text variant="rowTitle" numberOfLines={1}>
                  {row.label}
                </Text>
                {row.check === null ? null : (
                  <Text
                    variant="bodySm"
                    color={theme.semantic.state.warning}
                    testID={`money-review-check-${row.lineId}`}
                  >
                    {row.check}
                  </Text>
                )}
              </Stack>
              {row.assignees === null || row.byShare ? null : (
                <Animated.View
                  {...(reduced
                    ? {}
                    : { entering: FadeInRight.delay(staggerDelayMs(index, BAR_GROW_STAGGER_MS)) })}
                >
                  <AvatarStack
                    size="sm"
                    max={5}
                    members={row.assignees.map((member) => ({
                      key: member.userId,
                      uid: member.userId,
                      name: member.name,
                      joinIndex: member.joinIndex,
                    }))}
                  />
                </Animated.View>
              )}
              <View
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      row.chip.tone === 'pink'
                        ? theme.semantic.state.urgent
                        : theme.semantic.bg.control,
                  },
                ]}
              >
                <Text
                  variant="label"
                  color={row.chip.tone === 'pink' ? theme.semantic.text.onAccent : undefined}
                >
                  {row.chip.text}
                </Text>
              </View>
            </Row>
          </Pressable>
        ))}
        {props.mismatch === null ? null : (
          <Row gap="12" align="center" testID="money-review-mismatch">
            <Text variant="bodySm" style={{ flex: 1 }} color={theme.semantic.state.warning}>
              {props.mismatch.text}
            </Text>
            <Toggle
              value={props.mismatch.keep}
              onValueChange={props.onKeepTotal}
              label={t({ id: 'money.review.keepTotal', message: 'Keep total' })}
              testID="money-review-keep-total"
            />
          </Row>
        )}
        {props.mismatch === null || props.onFix === undefined ? null : (
          <TextLink
            label={t({ id: 'money.failure.type', message: 'Type the lines' })}
            onPress={props.onFix}
            testID="money-review-fix"
          />
        )}
      </ScrollView>
      <Row justify="space-between" style={{ flexWrap: 'wrap' }} testID="money-review-summary">
        {props.summary.map((part) => (
          <Text key={part.who} variant="body">
            {`${part.who} `}
            <Text variant="rowTitle" color={theme.semantic.action.primary}>
              {part.amount}
            </Text>
          </Text>
        ))}
      </Row>
      <TextLink
        label={t({ id: 'money.review.changePayer', message: 'Someone else paid?' })}
        onPress={props.onPayer}
        testID="money-review-payer"
      />
      <PillButton
        label={upper(t({ id: 'money.review.commit', message: `Split it · ${payer} paid` }), locale)}
        onPress={props.onCommit}
        loading={props.committing}
        block
        testID="money-review-commit"
      />
    </View>
  );
}
