/**
 * After "Not now" on the visits sheet: one quiet line on the hub that brings it back. Renders
 * nothing unless it is a trip day and the traveller has not decided.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useVisitConsentEntry } from '@/lib/location';
import { Icon, Text, TextButton, usePremiumTheme } from '@/ui/premium';

export function VisitConsentLine() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { offered, open } = useVisitConsentEntry();
  if (!offered) return null;
  return (
    <View style={[styles.row, { paddingHorizontal: th.space.gutter }]} testID="visit-consent-row">
      <Icon name="pin" size={16} color={th.color.muted} />
      <Text variant="caption" tone="muted" style={styles.flex}>
        {t({
          id: 'permissions.visits.row',
          message: 'Places you visit on this trip are not remembered yet.',
        })}
      </Text>
      <TextButton
        label={t({ id: 'permissions.visits.accept', message: 'Turn on' })}
        onPress={open}
        testID="visit-consent-row-action"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  flex: { flex: 1, minWidth: 0 },
});
