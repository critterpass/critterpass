/**
 * What didn't go through once back online (3k-4 conflicts): each rejected write with the reason in
 * words ("Your vote: Nusa Penida · The vote closed while you were offline"), and OK to clear it.
 * On the trip hub it outlives the offline card and leads to the offline page.
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

import { conflictReason } from './conflict-reason';

export function ConflictsList({
  items,
  onDismiss,
  onOpen = null,
}: {
  readonly items: readonly RejectedCommand[];
  readonly onDismiss: (opId: string) => void;
  /** The way to the offline page, where the list is shown beside what was sent. */
  readonly onOpen?: (() => void) | null;
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
          const reason = i18n._(conflictReason(item.code));
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
        {onOpen === null ? null : (
          <TextLink
            label={t({ id: 'trip.offline.conflictsOpen', message: 'See what was saved and sent' })}
            onPress={onOpen}
            testID="trip-offline-conflicts-open"
          />
        )}
      </Stack>
    </Card>
  );
}
