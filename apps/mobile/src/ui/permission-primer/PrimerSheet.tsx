import { t } from '@lingui/core/macro';
import { Platform, StyleSheet, View } from 'react-native';

import type { PrimerAnswer, PrimerRequest } from '@/lib/permissions';

import { InlineAction } from '../buttons/InlineAction';
import { PillButton } from '../buttons/PillButton';
import { Sheet } from '../sheet/Sheet';
import { Text } from '../text/Text';
import { BackgroundLocationDisclosure } from './BackgroundLocationDisclosure';
import { primerCopy } from './copy';
import { demoFor } from './demos';

export interface PrimerSheetProps {
  readonly request: PrimerRequest;
  readonly onAnswer: (answer: PrimerAnswer) => void;
}

/**
 * The just-in-time primer: the same card as 3a-9, as a sheet, at the moment a feature needs the
 * permission. "Turn on" leads to the OS prompt; after an OS denial the sheet offers Settings
 * instead. Dismissing it counts as "not now".
 */
export function PrimerSheet({ request, onAnswer }: PrimerSheetProps) {
  const copy = primerCopy(request.kind, request.level === 'always');
  const settings = request.mode === 'settings';
  // Google Play: background location needs its prominent disclosure before the system step.
  const disclosure = !settings && request.level === 'always' && Platform.OS === 'android';
  if (disclosure) {
    return (
      <Sheet
        detents={['fit']}
        onDismiss={() => onAnswer('decline')}
        accessibilityLabel={copy.title}
        testID="primer-sheet"
      >
        <BackgroundLocationDisclosure
          onContinue={() => onAnswer('accept')}
          onDecline={() => onAnswer('decline')}
        />
      </Sheet>
    );
  }
  return (
    <Sheet
      detents={['fit']}
      onDismiss={() => onAnswer('decline')}
      accessibilityLabel={copy.title}
      testID="primer-sheet"
    >
      <View style={styles.content}>
        {demoFor(request.kind)}
        <Text variant="h2" accessibilityRole="header">
          {copy.title}
        </Text>
        <Text variant="body">
          {settings
            ? t({
                id: 'permissions.sheet.settingsBody',
                message: 'It is switched off in Settings. Turn it on there and come straight back.',
              })
            : copy.body}
        </Text>
        <PillButton
          label={
            settings
              ? t({ id: 'permissions.primer.openSettings', message: 'Open Settings' })
              : copy.action
          }
          onPress={() => onAnswer('accept')}
          block
          testID="primer-sheet-accept"
        />
        <InlineAction
          label={t({ id: 'permissions.sheet.notNow', message: 'Not now' })}
          onPress={() => onAnswer('decline')}
          testID="primer-sheet-decline"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 12, gap: 14, alignItems: 'center' },
});
