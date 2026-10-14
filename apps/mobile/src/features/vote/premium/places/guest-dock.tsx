/**
 * The guest guide's dock (4.03): Pitch to the crew and Go solo, on a fade to the ground so the
 * notes scrolling under it never show through the buttons.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, usePremiumTheme } from '@/ui/premium';
import { SCROLL_EDGE_FADE, ScrollEdgeFade } from '@/ui/premium/shell';

export function GuestDock(props: { readonly onPitch: () => void; readonly onSolo: () => void }) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const dockBand = insets.bottom + theme.space.gap12 + theme.size.button + theme.space.gap8;
  return (
    <>
      {/* Opaque behind the whole dock, fading above it: the list never reads half under it. */}
      <ScrollEdgeFade edge="bottom" height={dockBand + SCROLL_EDGE_FADE} solid={dockBand} />

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
