/**
 * Who had a line (undesigned; opened by tapping a line in the review): every member as a toggle
 * avatar, EVERYONE to reset, DONE to apply. At least one member must stay on. A crew too big for
 * the sheet scrolls its avatars, and EVERYONE and DONE stay at the sheet's foot.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import type { MoneyMember } from '../data/context';

const useStyles = makeStyles((t) => ({
  body: { padding: t.space['16'], gap: t.space['16'] },
  foot: { paddingHorizontal: t.space['16'], paddingTop: t.space['8'], gap: t.space['16'] },
  grid: { gap: t.space['12'], flexWrap: 'wrap' },
  person: { alignItems: 'center', gap: t.space['4'] },
  off: { opacity: 0.35 },
}));

export function MemberPicker({
  title,
  members,
  selected,
  onDone,
  onClose,
}: {
  readonly title: string;
  readonly members: readonly MoneyMember[];
  /** null = everyone. */
  readonly selected: readonly string[] | null;
  readonly onDone: (next: readonly string[] | null) => void;
  readonly onClose: () => void;
}) {
  const styles = useStyles();
  const locale = useLocale();
  const { t } = useLingui();
  const all = members.map((member) => member.userId);
  const [picked, setPicked] = useState<readonly string[]>(selected ?? all);
  const everyone = picked.length === all.length;
  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id)
        ? current.length === 1
          ? current
          : current.filter((member) => member !== id)
        : all.filter((member) => member === id || current.includes(member)),
    );
  return (
    <Sheet
      detents={['fit']}
      title={title}
      onDismiss={onClose}
      accessibilityLabel={title}
      testID="money-member-picker"
    >
      <SheetScrollView contentContainerStyle={styles.body} testID="money-member-scroll">
        <Row style={styles.grid}>
          {members.map((member) => {
            const on = picked.includes(member.userId);
            return (
              <Pressable
                key={member.userId}
                onPress={() => toggle(member.userId)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={member.name}
                testID={`money-member-${member.joinIndex}`}
              >
                <Stack style={[styles.person, on ? null : styles.off]}>
                  <Avatar name={member.name} joinIndex={member.joinIndex} size="lg" decorative />
                  <Text variant="label">{member.name}</Text>
                </Stack>
              </Pressable>
            );
          })}
        </Row>
      </SheetScrollView>
      <View style={styles.foot}>
        <Row>
          <ChoiceChip
            label={upper(t({ id: 'money.picker.everyone', message: 'Everyone' }), locale)}
            selected={everyone}
            onPress={() => setPicked(all)}
            testID="money-member-everyone"
          />
        </Row>
        <PillButton
          label={upper(t({ id: 'money.picker.done', message: 'Done' }), locale)}
          onPress={() => onDone(everyone ? null : picked)}
          block
          testID="money-member-done"
        />
      </View>
    </Sheet>
  );
}
