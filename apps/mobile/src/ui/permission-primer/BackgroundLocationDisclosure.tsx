import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { InlineAction } from '../buttons/InlineAction';
import { PillButton } from '../buttons/PillButton';
import { Text } from '../text/Text';
import { useTheme } from '../theme';
import { CritterPingDemo } from './demos';

export interface BackgroundLocationDisclosureProps {
  readonly onContinue: () => void;
  readonly onDecline: () => void;
}

/**
 * The prominent disclosure Google Play requires before asking for background location: what is
 * collected, for which features, that it happens with the app closed, and how to stop it. Shown
 * as the Always-upgrade primer on Android; "Continue" leads to the system's own "Allow all the
 * time" step.
 */
export function BackgroundLocationDisclosure({
  onContinue,
  onDecline,
}: BackgroundLocationDisclosureProps) {
  const theme = useTheme();
  return (
    <View style={styles.content} testID="background-location-disclosure">
      <CritterPingDemo />
      <Text variant="h2" accessibilityRole="header">
        {t({ id: 'permissions.disclosure.title', message: 'Location in the background' })}
      </Text>
      <Text variant="body">
        {t({
          id: 'permissions.disclosure.body',
          message:
            'CritterPass collects location data to find critters near you, keep your crew map current and time your leave-by alerts, even when the app is closed or not in use.',
        })}
      </Text>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {t({
          id: 'permissions.disclosure.limits',
          message:
            'Only on trip days, never at home. We keep the places you checked in at, never a trail of coordinates. Turn it off any time in Settings or from the trip-day notification.',
        })}
      </Text>
      <PillButton
        label={t({ id: 'permissions.disclosure.continue', message: 'Continue' })}
        onPress={onContinue}
        block
        testID="background-location-disclosure-continue"
      />
      <InlineAction
        label={t({ id: 'permissions.disclosure.decline', message: 'No thanks' })}
        onPress={onDecline}
        testID="background-location-disclosure-decline"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 12, gap: 14, alignItems: 'center' },
});
