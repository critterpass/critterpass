/**
 * The crew's code on the invite screen (undesigned; from the card and code patterns): the six
 * letters a friend types under "Join with a code", large enough to read out, and one tap to copy.
 * It is the same code the organiser saw when the crew was made.
 */
import { t } from '@lingui/core/macro';

import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export function CrewCode({ code, onCopy }: { readonly code: string; readonly onCopy: () => void }) {
  const theme = useTheme();
  return (
    <Card tone="sunken" testID="composer-code">
      <Stack gap="8">
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {t({ id: 'crew.composer.codeLabel', message: 'Crew code' })}
        </Text>
        <Row justify="space-between" align="center" gap="12">
          <Text variant="monoData" selectable testID="composer-code-value">
            {code}
          </Text>
          <PillButton
            size="sm"
            variant="secondary"
            label={t({ id: 'crew.composer.codeCopy', message: 'Copy code' })}
            onPress={onCopy}
            testID="composer-code-copy"
          />
        </Row>
        <Text variant="bodySm" color={theme.semantic.text.secondary} singleLine={false}>
          {t({
            id: 'crew.composer.codeHint',
            message: 'A friend opens CritterPass, taps "Join with a code" and types it in.',
          })}
        </Text>
      </Stack>
    </Card>
  );
}
