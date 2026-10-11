/**
 * Appearance (9.02): a half-height sheet with one choice. Picking one applies at once (the page
 * behind redraws) and closes the sheet; Cancel keeps what was there.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { APPEARANCES, Icon, ListCard, Row, useAppearance, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { useAppearanceWords } from './appearance-copy';

export function AppearanceSheet() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const [appearance, setAppearance] = useAppearance();
  const words = useAppearanceWords();
  return (
    <SheetScreen
      title={t({ id: 'you.premium.appearance', message: 'Appearance' })}
      cancelLabel={t({ id: 'you.premium.cancel', message: 'Cancel' })}
      scroll={false}
      testID="you-appearance"
    >
      <View style={{ paddingHorizontal: th.space.gutter, paddingTop: th.space.gap12 }}>
        <ListCard>
          {APPEARANCES.map((choice) => (
            <Row
              key={choice}
              title={words[choice]}
              trailing={
                appearance === choice ? (
                  <Icon name="check" size={18} color={th.color.ink} />
                ) : undefined
              }
              onPress={() => {
                setAppearance(choice);
                router.back();
              }}
              testID={`you-appearance-${choice}`}
            />
          ))}
        </ListCard>
      </View>
    </SheetScreen>
  );
}
