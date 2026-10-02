/**
 * What the expense was and when (undesigned; opened from the description row): the name, the
 * category chips (stays / food / transit / fun / other) and the day it was spent (today, or one of
 * the trip's days so far), keeping the time of day. The fields scroll and DONE stays at the foot,
 * which the sheet keeps above the keyboard while the name is typed.
 */
import type { ExpenseCategory } from '@cp/domain';
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { CATEGORY_ORDER, useCategoryLabel } from '../components/category';

const useStyles = makeStyles((t) => ({
  body: { padding: t.space['16'], gap: t.space['16'] },
  foot: { paddingHorizontal: t.space['16'], paddingTop: t.space['8'] },
  chips: { gap: t.space['8'], flexWrap: 'wrap' },
  days: { gap: t.space['8'] },
}));

const DAY_MS = 86_400_000;
/** How many days back the day chips reach. */
export const DAY_CHIPS = 7;

/** The same time of day, `daysBack` days earlier. */
export function shiftDays(now: Date, daysBack: number): string {
  return new Date(now.getTime() - daysBack * DAY_MS).toISOString();
}

export function DetailsSheet({
  description,
  category,
  daysBack,
  onDescription,
  onCategory,
  onDay,
  onClose,
}: {
  readonly description: string;
  readonly category: ExpenseCategory;
  readonly daysBack: number;
  readonly onDescription: (text: string) => void;
  readonly onCategory: (category: ExpenseCategory) => void;
  readonly onDay: (daysBack: number) => void;
  readonly onClose: () => void;
}) {
  const styles = useStyles();
  const locale = useLocale();
  const { t } = useLingui();
  const categoryLabel = useCategoryLabel();
  const title = t({ id: 'money.add.detailsTitle', message: 'What was it?' });
  const now = new Date();
  return (
    <Sheet
      detents={['large']}
      title={title}
      onDismiss={onClose}
      accessibilityLabel={title}
      testID="money-add-details"
    >
      <SheetScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        testID="money-add-details-scroll"
      >
        <TextField
          label={t({ id: 'money.add.name', message: 'Name' })}
          value={description}
          onChangeText={onDescription}
          maxLength={140}
          placeholder={t({
            id: 'money.add.namePlaceholder',
            message: 'Smoothie bowls, Clear Café',
          })}
          testID="money-add-name"
        />
        <Stack gap="8">
          <Text variant="eyebrow">
            {upper(t({ id: 'money.add.category', message: 'Category' }), locale)}
          </Text>
          <Row style={styles.chips}>
            {CATEGORY_ORDER.map((option) => (
              <ChoiceChip
                key={option}
                label={upper(categoryLabel(option), locale)}
                selected={option === category}
                onPress={() => onCategory(option)}
                testID={`money-add-category-${option}`}
              />
            ))}
          </Row>
        </Stack>
        <Stack gap="8">
          <Text variant="eyebrow">
            {upper(t({ id: 'money.add.when', message: 'When' }), locale)}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Row style={styles.days}>
              {Array.from({ length: DAY_CHIPS }, (_, back) => (
                <ChoiceChip
                  key={back}
                  label={
                    back === 0
                      ? t({ id: 'money.add.today', message: 'Today' })
                      : back === 1
                        ? t({ id: 'money.add.yesterday', message: 'Yesterday' })
                        : format.date(locale, new Date(now.getTime() - back * DAY_MS), {
                            weekday: 'short',
                            day: 'numeric',
                          })
                  }
                  selected={back === daysBack}
                  onPress={() => onDay(back)}
                  testID={`money-add-day-${back}`}
                />
              ))}
            </Row>
          </ScrollView>
        </Stack>
      </SheetScrollView>
      <View style={styles.foot}>
        <PillButton
          label={upper(t({ id: 'money.add.done', message: 'Done' }), locale)}
          onPress={onClose}
          block
          testID="money-add-details-done"
        />
      </View>
    </Sheet>
  );
}
