/**
 * What didn't go through once back online (3k-4 conflicts): each rejected write with the reason in
 * words ("Your vote: Nusa Penida · The vote closed while you were offline"), and OK to clear it.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import type { RejectedCommand } from '@/data/status/use-rejected-commands';
import { useLocale } from '@/lib/i18n/use-locale';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export function ConflictsList({
  items,
  onDismiss,
}: {
  readonly items: readonly RejectedCommand[];
  readonly onDismiss: (opId: string) => void;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const { i18n, t } = useLingui();
  if (items.length === 0) return null;
  return (
    <Card testID="trip-offline-conflicts">
      <Stack gap="12">
        <Text variant="eyebrow" color={theme.color.pink} accessibilityRole="header">
          {upper(t({ id: 'trip.offline.conflictsTitle', message: "Didn't go through" }), locale)}
        </Text>
        {items.map((item) => {
          const reason = i18n._({ id: item.messageKey, message: item.code });
          return (
            <Row key={item.opId} gap="12" align="center">
              <Stack gap="2" flex={1}>
                <Text variant="rowTitle">{i18n._(item.summary)}</Text>
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {reason}
                </Text>
              </Stack>
              <TextLink
                label={t({ id: 'trip.offline.conflictOk', message: 'OK' })}
                onPress={() => onDismiss(item.opId)}
                testID={`trip-offline-conflict-${item.opId}`}
              />
            </Row>
          );
        })}
      </Stack>
    </Card>
  );
}
