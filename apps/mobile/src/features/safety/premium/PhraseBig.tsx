/**
 * The phrase shown big (6.16 "Show this"): a light card, whatever the phone's mode, with the phrase
 * as large as it fits and its meaning under it, at full brightness for whoever reads it. ✕ closes.
 */
import { useLingui } from '@lingui/react/macro';
import { Modal, StyleSheet, View } from 'react-native';

import { PremiumThemeProvider, Text, usePremiumTheme } from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

function Card({ phrase, gloss }: { readonly phrase: string; readonly gloss: string }) {
  const th = usePremiumTheme();
  return (
    <View style={[styles.root, { backgroundColor: th.color.card }]}>
      <Text variant="hero" align="center" adjustsFontSizeToFit numberOfLines={4} minimumFontScale={0.4}>
        {phrase}
      </Text>
      {gloss === '' ? null : (
        <Text variant="body" tone="muted" align="center">
          {gloss}
        </Text>
      )}
    </View>
  );
}

export function PhraseBig(props: {
  readonly phrase: string;
  readonly gloss: string;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  return (
    <Modal visible animationType="fade" onRequestClose={props.onClose} testID="help-show-it">
      <PremiumThemeProvider scheme="light">
        <FullScreen closeLabel={t({ id: 'safety.premium.close', message: 'Close' })} brighten overPhoto={false} onClose={props.onClose}>
          <Card phrase={props.phrase} gloss={props.gloss} />
        </FullScreen>
      </PremiumThemeProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 },
});
