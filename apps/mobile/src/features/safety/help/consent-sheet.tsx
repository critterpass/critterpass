/**
 * The Help share consent (first Help open): "Share where I am with {crew} for 1 hour when I open
 * Help", OFF until the traveller turns it on. Whatever they choose is remembered (`consents`,
 * purpose `help_auto_share`) and can be changed in Settings; Help works fully either way.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Toggle } from '@/ui/inputs/Toggle';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export interface ConsentSheetProps {
  readonly crewName: string;
  readonly onAnswer: (granted: boolean) => void;
}

export function ConsentSheet({ crewName, onAnswer }: ConsentSheetProps) {
  const { t } = useLingui();
  const theme = useTheme();
  const [on, setOn] = useState(false);
  const title = t({ id: 'safety.consent.title', message: 'Let the crew find you' });
  const toggle =
    crewName === ''
      ? t({
          id: 'safety.consent.toggleCrew',
          message: 'Share where I am with my crew for 1 hour when I open Help',
        })
      : t({
          id: 'safety.consent.toggle',
          message: `Share where I am with ${crewName} for 1 hour when I open Help`,
        });
  return (
    <Sheet
      detents={['fit']}
      onDismiss={() => onAnswer(false)}
      accessibilityLabel={title}
      testID="help-consent-sheet"
    >
      <View style={{ padding: theme.size.gutter }}>
        <Stack gap="16">
          <Text variant="h2" accessibilityRole="header">
            {title}
          </Text>
          <Row gap="12" align="center">
            <Stack flex={1}>
              <Text variant="body">{toggle}</Text>
            </Stack>
            <Toggle value={on} onValueChange={setOn} label={toggle} testID="help-consent-toggle" />
          </Row>
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {t({
              id: 'safety.consent.control',
              message:
                'The share stops by itself after an hour. Off, Help still has every number and phrase, and you can share with one tap. Change it any time in Settings.',
            })}
          </Text>
          <PillButton
            label={t({ id: 'safety.consent.done', message: 'Done' })}
            block
            onPress={() => onAnswer(on)}
            testID="help-consent-done"
          />
        </Stack>
      </View>
    </Sheet>
  );
}
