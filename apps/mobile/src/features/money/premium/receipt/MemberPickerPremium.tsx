/**
 * Who had a line, or who paid, in the premium look (undesigned): a native page sheet that swipes
 * down to close, Cancel on the left and the bold Done on the right, every member as an avatar that
 * turns on or off, and Everyone to put them all back. At least one member stays on.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { crewAccent } from '@/features/trip';
import { Avatar, PressableScale, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import { toggleMember, type MemberPickerProps } from '../../receipt/MemberPicker';

export function MemberPickerPremium({
  title,
  members,
  selected,
  onDone,
  onClose,
}: MemberPickerProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const all = members.map((member) => member.userId);
  const [picked, setPicked] = useState<readonly string[]>(selected ?? all);
  const everyone = picked.length === all.length;
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View
        style={[styles.root, { backgroundColor: th.color.ground }]}
        accessibilityLabel={title}
        testID="money-member-picker"
      >
        <View
          style={[
            styles.head,
            {
              paddingHorizontal: th.space.gutter,
              ...(Platform.OS === 'ios' ? {} : { paddingTop: insets.top }),
            },
          ]}
        >
          <View style={styles.side}>
            <TextButton
              label={t({ id: 'common.confirm.cancel', message: 'Cancel' })}
              onPress={onClose}
              testID="money-member-cancel"
            />
          </View>
          <Text
            variant="headline"
            numberOfLines={1}
            accessibilityRole="header"
            style={styles.title}
          >
            {title}
          </Text>
          <View style={[styles.side, styles.end]}>
            <TextButton
              label={t({ id: 'money.picker.done', message: 'Done' })}
              tone="ink"
              onPress={() => onDone(everyone ? null : picked)}
              testID="money-member-done"
            />
          </View>
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.grid,
            { padding: th.space.gutter, paddingBottom: insets.bottom + th.space.gutter },
          ]}
          testID="money-member-scroll"
        >
          {members.map((member) => {
            const on = picked.includes(member.userId);
            return (
              <PressableScale
                key={member.userId}
                onPress={() => setPicked((current) => toggleMember(all, current, member.userId))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={member.name}
                testID={`money-member-${String(member.joinIndex)}`}
              >
                <View style={[styles.person, on ? null : { opacity: th.opacity.disabled }]}>
                  <Avatar
                    name={member.name}
                    color={crewAccent(member.joinIndex)}
                    size={52}
                    ringed
                  />
                  <Text variant="label" numberOfLines={1}>
                    {member.name}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
          <View style={styles.everyone}>
            <TextButton
              label={t({ id: 'money.picker.everyone', message: 'Everyone' })}
              tone="ink"
              disabled={everyone}
              onPress={() => setPicked(all)}
              testID="money-member-everyone"
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 8 },
  side: { flex: 1 },
  end: { alignItems: 'flex-end' },
  title: { flex: 2, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  person: { alignItems: 'center', gap: 6, width: 72 },
  everyone: { width: '100%' },
});
