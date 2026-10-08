/**
 * CUSTOM (undesigned): an amount per member, typed on the same keypad by tapping the member's
 * field (TOTAL takes the keypad back), with a live "left to assign" line: yellow while short, pink
 * when over, green when it adds up. ADD refuses a mismatch.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { Amount } from '@/ui/money/Amount';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import type { MoneyMember } from '../data/context';
import { formatAmount } from '../format';
import { fixedMinorOf, leftToAssign, type ExpenseDraft } from './draft';

const useStyles = makeStyles((t) => ({
  row: {
    alignItems: 'center',
    gap: t.space['12'],
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: t.space['8'],
    borderRadius: t.radius.md,
    borderWidth: t.space['2'],
    borderColor: 'transparent',
  },
  focused: { borderColor: t.semantic.action.primary, backgroundColor: t.semantic.bg.control },
  name: { flex: 1 },
}));

export function SplitEditorCustom({
  members,
  draft,
  onFocus,
}: {
  readonly members: readonly MoneyMember[];
  readonly draft: ExpenseDraft;
  readonly onFocus: (userId: string | null) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const left = leftToAssign(draft);
  const leftText = formatAmount(left < 0n ? -left : left, draft.currency, locale);
  const status =
    left === 0n
      ? t({ id: 'money.add.allAssigned', message: 'All assigned' })
      : left > 0n
        ? t({ id: 'money.add.leftToAssign', message: `${leftText} left to assign` })
        : t({ id: 'money.add.overAssigned', message: `${leftText} too much` });
  const color =
    left === 0n
      ? theme.semantic.state.success
      : left > 0n
        ? theme.semantic.action.primary
        : theme.semantic.state.urgent;
  return (
    <Stack gap="4" testID="money-split-custom">
      <Text
        variant="label"
        color={color}
        accessibilityLiveRegion="polite"
        testID={left === 0n ? 'money-custom-balanced' : 'money-custom-left'}
      >
        {upper(status, locale)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: draft.focus === null }}
        onPress={() => onFocus(null)}
        style={[styles.row, draft.focus === null ? styles.focused : null]}
        testID="money-custom-total"
      >
        <Row style={{ flex: 1 }}>
          <Text variant="eyebrow" style={styles.name}>
            {upper(t({ id: 'money.add.total', message: 'Total' }), locale)}
          </Text>
        </Row>
      </Pressable>
      {members.map((member) => {
        const focused = draft.focus === member.userId;
        const amount = fixedMinorOf(draft, member.userId);
        return (
          <Pressable
            key={member.userId}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={`${member.name}, ${formatAmount(amount, draft.currency, locale)}`}
            onPress={() => onFocus(member.userId)}
            style={[styles.row, focused ? styles.focused : null]}
            testID={`money-custom-${member.joinIndex}`}
          >
            <Row style={{ flex: 1, alignItems: 'center', gap: theme.space['12'] }}>
              <Avatar
                name={member.name}
                uid={member.userId}
                joinIndex={member.joinIndex}
                size="sm"
                decorative
              />
              <Text variant="rowTitle" style={styles.name} numberOfLines={1}>
                {member.name}
              </Text>
              <Amount
                variant="rowTitle"
                color={amount === 0n ? theme.semantic.text.secondary : undefined}
              >
                {formatAmount(amount, draft.currency, locale)}
              </Amount>
            </Row>
          </Pressable>
        );
      })}
    </Stack>
  );
}
