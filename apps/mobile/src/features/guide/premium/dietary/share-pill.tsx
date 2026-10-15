/**
 * The dietary form's share switch as the design draws it (5.22): a pill in the header's corner,
 * green "Sharing flags" while the crew and the guide see the flags, grey "Not sharing" when they
 * don't. Tapping it switches; what sharing shows is read out as its hint.
 */
import { t } from '@lingui/core/macro';

import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';

export function SharePill({
  shared,
  onChange,
}: {
  readonly shared: boolean;
  readonly onChange: (share: boolean) => void;
}) {
  const th = usePremiumTheme();
  const tone = shared ? th.color.status.booked : th.color.status.unopened;
  const label = shared
    ? t({ id: 'guide.premium.dietary.sharing', message: 'Sharing flags' })
    : t({ id: 'guide.premium.dietary.notSharing', message: 'Not sharing' });
  return (
    <PressableScale
      onPress={() => onChange(!shared)}
      accessibilityRole="switch"
      accessibilityState={{ checked: shared }}
      accessibilityLabel={t({
        id: 'guide.dietary.shareToggle',
        message: 'Share flags with my crew and guide',
      })}
      accessibilityHint={t({
        id: 'guide.dietary.shareCaption',
        message: 'They see “vegetarian” or “no peanuts”, never your notes or your avoid list.',
      })}
      style={{
        height: 32,
        borderRadius: 16,
        paddingHorizontal: th.space.gap12,
        justifyContent: 'center',
        backgroundColor: tone.bg,
      }}
      testID="guide-dietary-share"
    >
      <Text variant="caption" color={tone.text}>
        {label}
      </Text>
    </PressableScale>
  );
}
