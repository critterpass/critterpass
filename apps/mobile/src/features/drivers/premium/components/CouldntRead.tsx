/**
 * Couldn't read it, premium: the guide thinking over what could be read and why not, the shared
 * text with where it stops, centred in the page; at its foot Type the rest in, and Try another
 * screenshot as the second button.
 */
import type { ParsedIntake } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guideCritterKind } from '@/features/trip';
import { Button, CritterSticker, StatusTag, Text, usePremiumTheme } from '@/ui/premium';
import { FooterStack, PushScreen } from '@/ui/premium/shell';

export function CouldntReadPremium(props: {
  readonly guide: { readonly id: string; readonly name: string };
  readonly source: string;
  readonly parsed: ParsedIntake | null;
  readonly onType: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
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
        contentContainerStyle={[
          styles.body,
          { paddingHorizontal: th.space.gutter, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={[styles.middle, { gap: th.space.gap16 }]}>
          <CritterSticker
            kind={guideCritterKind(props.guide.id)}
            name={props.guide.name}
            size={96}
            pose="think"
          />
          <Text variant="rowText" tone="inkSecondary" align="center">
            {parsed?.unreadable.join(' ') ||
              t({
                id: 'drivers.unread.body',
                message: 'I couldn’t find a driver’s name, number or price in it.',
              })}
          </Text>
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
        </View>
        <FooterStack gap={th.space.gap10}>
          <Button
            label={t({ id: 'drivers.unread.type', message: 'Type the rest in' })}
            size="large"
            onPress={props.onType}
            testID="drivers-unread-type"
          />
          <Button
            label={t({ id: 'drivers.unread.another', message: 'Try another screenshot' })}
            size="large"
            variant="secondary"
            onPress={() => router.back()}
            testID="drivers-unread-another"
          />
        </FooterStack>
      </ScrollView>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, paddingTop: 8, gap: 24 },
  // The guide and what it read sit in the page's middle, the two ways on at its foot.
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  peek: { alignSelf: 'stretch', padding: 12, gap: 8, alignItems: 'flex-start' },
});
