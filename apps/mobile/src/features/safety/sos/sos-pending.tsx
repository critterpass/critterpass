/**
 * An SOS before its incident row is on this phone: just sent (still going out, or waiting for
 * signal in the offline queue), or opened from a push before sync caught up. Never a blank screen
 * at the worst moment: it says what is happening and keeps the local number one tap away.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillButton } from '@/ui/buttons/PillButton';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Stack } from '@/ui/layout/Stack';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export interface SosPendingProps {
  /** This phone just sent it; otherwise someone else's SOS is still loading. */
  readonly sent: boolean;
  readonly general: string;
  readonly onCallGeneral: () => void;
}

export function SosPending({ sent, general, onCallGeneral }: SosPendingProps) {
  const { t } = useLingui();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Scaffold variant="dark" testID="sos-pending">
      <ScrollView
        contentContainerStyle={{
          padding: theme.size.gutter,
          paddingBottom: insets.bottom + theme.space['32'],
        }}
      >
        <Stack gap="16">
          <Text variant="h1" accessibilityRole="header">
            {sent
              ? t({ id: 'safety.pending.sentTitle', message: 'Sending your SOS to the crew' })
              : t({ id: 'safety.pending.openTitle', message: 'Opening the SOS' })}
          </Text>
          <SecondaryText>
            {sent
              ? t({
                  id: 'safety.pending.sentLine',
                  message: 'It goes the moment you have signal. Who has seen it shows here.',
                })
              : t({
                  id: 'safety.pending.openLine',
                  message: 'It shows here as soon as this phone has it.',
                })}
          </SecondaryText>
          <PillButton
            label={t({ id: 'safety.sos.callGeneral', message: `Call ${general}` })}
            tone="yellow"
            block
            onPress={onCallGeneral}
            testID="sos-pending-call"
          />
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
