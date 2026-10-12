/**
 * The guest guide's dock (4.03): Pitch to the crew and Go solo, on a fade to the ground so the
 * notes scrolling under it never show through the buttons.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, usePremiumTheme } from '@/ui/premium';

/** The fade's height above the safe area (130 tall in the design, the buttons included). */
const DOCK_FADE = 100;

/** A colour at zero alpha, so the fade runs from the ground's own hue, not from black. */
function clearOf(colour: string): string {
  return /^#[0-9a-f]{6}$/i.test(colour) ? `${colour}00` : 'transparent';
}

export function GuestDock(props: { readonly onPitch: () => void; readonly onSolo: () => void }) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  return (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.dockFade,
          {
            height: insets.bottom + DOCK_FADE,
            experimental_backgroundImage: `linear-gradient(180deg, ${clearOf(theme.color.ground)}, ${theme.color.ground} 46%)`,
          },
        ]}
      />

      <View
        style={{
          position: 'absolute',
          left: theme.space.gap16,
          right: theme.space.gap16,
          bottom: insets.bottom + theme.space.gap12,
          flexDirection: 'row',
          gap: theme.space.gap8,
        }}
      >
        <View style={{ flex: 1.5 }}>
          <Button
            label={t({ id: 'vote.guest.pitch', message: 'Pitch to the crew' })}
            onPress={props.onPitch}
            testID="guest-pitch"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={t({ id: 'vote.premium.guest.solo', message: 'Go solo' })}
            variant="secondary"
            onPress={props.onSolo}
            testID="guest-solo"
          />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  dockFade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
