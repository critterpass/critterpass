/**
 * The split editors under SPLIT (undesigned; built from chips, avatars and stepper buttons):
 * - EVENLY: a chip per member, on = in the split; tapping one leaves them out.
 * - BY SHARE: a stepper per member (0 leaves them out) with their share beside it.
 * Each row shows the member's crew-currency share as it re-counts.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { IconButton } from '@/ui/buttons/IconButton';
import { FilterChip } from '@/ui/chips/FilterChip';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { Amount } from '@/ui/money/Amount';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import type { MoneyMember } from '../data/context';
import { formatAmount } from '../format';
import { weightOf, type ExpenseDraft } from './draft';

const useStyles = makeStyles((t) => ({
  chips: { gap: t.space['8'] },
  row: { alignItems: 'center', gap: t.space['12'], minHeight: MIN_TOUCH_TARGET },
  name: { flex: 1 },
  count: { minWidth: t.space['24'], textAlign: 'center' },
}));

export function SplitEditorEvenly({
  members,
  draft,
  onToggle,
}: {
  readonly members: readonly MoneyMember[];
  readonly draft: ExpenseDraft;
  readonly onToggle: (userId: string) => void;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  const count = draft.included.length;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="money-split-evenly">
      <Row style={styles.chips}>
        {members.map((member) => (
          <FilterChip
            key={member.userId}
            label={member.name}
            selected={draft.included.includes(member.userId)}
            onPress={() => onToggle(member.userId)}
            testID={`money-split-in-${member.joinIndex}`}
          />
        ))}
      </Row>
      <View
        accessibilityLiveRegion="polite"
        accessibilityLabel={t({
          id: 'money.add.evenlyA11y',
          message: `${count} in the split`,
        })}
      />
    </ScrollView>
  );
}

export function SplitEditorShares({
  members,
  draft,
  perMember,
  currency,
  onStep,
}: {
  readonly members: readonly MoneyMember[];
  readonly draft: ExpenseDraft;
  readonly perMember: ReadonlyMap<string, bigint> | null;
  readonly currency: string;
  readonly onStep: (userId: string, delta: 1 | -1) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  return (
    <Stack gap="2" testID="money-split-shares">
      {members.map((member) => {
        const weight = weightOf(draft, member.userId);
        const share = perMember?.get(member.userId) ?? 0n;
        const name = member.name;
        return (
          <Row key={member.userId} style={styles.row}>
            <Avatar
              name={member.name}
              uid={member.userId}
              joinIndex={member.joinIndex}
              size="sm"
              decorative
            />
            <Text variant="rowTitle" style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Amount variant="rowTitle" color={theme.semantic.text.secondary}>
              {weight === 0
                ? t({ id: 'money.add.out', message: 'Out' })
                : formatAmount(share, currency, locale)}
            </Amount>
            <IconButton
              label={t({ id: 'money.add.fewer', message: `One share fewer for ${name}` })}
              glyph={<Text variant="h3">−</Text>}
              onPress={() => onStep(member.userId, -1)}
              disabled={weight === 0}
              testID={`money-share-less-${member.joinIndex}`}
            />
            <Text
              variant="h3"
              style={styles.count}
              testID={`money-share-count-${member.joinIndex}`}
            >
              {String(weight)}
            </Text>
            <IconButton
              label={t({ id: 'money.add.more', message: `One share more for ${name}` })}
              glyph={<Text variant="h3">+</Text>}
              onPress={() => onStep(member.userId, 1)}
              testID={`money-share-more-${member.joinIndex}`}
            />
          </Row>
        );
      })}
    </Stack>
  );
}
