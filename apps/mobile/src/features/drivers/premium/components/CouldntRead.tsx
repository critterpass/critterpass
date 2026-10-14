/**
 * Couldn't read it, premium: the guide thinking, what could be read and why not, the shared text
 * with where it stops, Type the rest in, and Try another screenshot.
 */
import type { ParsedIntake } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { guideCritterKind } from '@/features/trip';
import { Button, CritterSticker, StatusTag, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

export function CouldntReadPremium(props: {
  readonly guide: { readonly id: string; readonly name: string };
  readonly source: string;
  readonly parsed: ParsedIntake | null;
  readonly onType: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { source, parsed } = props;
  return (
    <PushScreen
      title={t({ id: 'drivers.unread.title', message: 'Couldn’t read it' })}
      backLabel={t({ id: 'drivers.back.add', message: 'Add a driver' })}
      scroll={false}
      testID="drivers-unread"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.body, { paddingHorizontal: th.space.gutter }]}
      >
        <View style={styles.row}>
          <CritterSticker
            kind={guideCritterKind(props.guide.id)}
            name={props.guide.name}
            size={64}
            pose="think"
          />
          <Text variant="rowText" tone="muted" style={styles.flex}>
            {parsed?.unreadable.join(' ') ||
              t({
                id: 'drivers.unread.body',
                message: 'I couldn’t find a driver’s name, number or price in it.',
              })}
          </Text>
        </View>
        {source === '' ? null : (
          <View
            style={[
              styles.peek,
              { borderRadius: th.radius.cardRow, backgroundColor: th.accent.paper },
            ]}
          >
            <Text variant="mono" numberOfLines={8}>
              {source}
            </Text>
            {parsed?.cut_off === true ? (
              <StatusTag
                label={t({ id: 'drivers.premium.cutOff', message: 'Cut off here' })}
                tone="maybe"
              />
            ) : null}
          </View>
        )}
        <Button
          label={t({ id: 'drivers.unread.type', message: 'Type the rest in' })}
          size="large"
          onPress={props.onType}
          testID="drivers-unread-type"
        />
        <View style={styles.center}>
          <TextButton
            align="center"
            label={t({ id: 'drivers.unread.another', message: 'Try another screenshot' })}
            onPress={() => router.back()}
          />
        </View>
      </ScrollView>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 40, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  peek: { padding: 12, gap: 8, alignItems: 'flex-start' },
  center: { alignItems: 'center' },
});
