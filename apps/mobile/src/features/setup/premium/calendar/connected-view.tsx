/**
 * Calendar connected (4.13), full screen: a mint check while the sign-in settles and once the
 * calendar is in, a quiet cross when it was refused or failed, the title and line, and "Back to
 * setup". The shared `CalendarConnectedScreen` sends the connect command and picks the outcome.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Spinner, Text, usePremiumTheme } from '@/ui/premium';

import { connectedWords, type CalendarConnectedViewProps } from '../../calendar/connected-screen';

const DISC = 96;

export function PremiumCalendarConnectedView({ outcome, onDone }: CalendarConnectedViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const copy = connectedWords(outcome);
  const good = outcome === 'connected';
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.ground,
        paddingTop: insets.top,
        paddingBottom: insets.bottom + theme.space.gap12,
        paddingHorizontal: theme.space.titleGutter,
      }}
      testID={`calendar-connected-${outcome}`}
    >
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space.gap12 }}
      >
        <View
          style={{
            width: DISC,
            height: DISC,
            borderRadius: DISC / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: good ? theme.color.toggleOn : theme.color.card,
          }}
        >
          {outcome === 'connecting' ? (
            <Spinner size={36} />
          ) : (
            <Icon
              name={good ? 'check' : 'close'}
              size={44}
              color={good ? theme.color.onAccent : theme.color.placeholder}
            />
          )}
        </View>
        <Text variant="display" align="center" accessibilityRole="header">
          {copy.title}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {copy.line}
        </Text>
      </View>
      <Button
        label={t({ id: 'setup.connected.back', message: 'Back to setup' })}
        onPress={onDone}
        disabled={outcome === 'connecting'}
        testID="calendar-connected-back"
      />
    </View>
  );
}
