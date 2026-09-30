/**
 * STILL WORKS (3k-4): what the phone has for today with no signal, from the saved day bundle and
 * the synced plan ("Today's plan and the 09:00 pickup", "Trail map, downloaded at 03:02",
 * "Phrase cards", "Hot spring tickets for 09:30"). A day only partly saved says what is missing.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card } from '@/ui/cards/Card';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface StillWorksLine {
  readonly key: string;
  readonly text: string;
  /** Not on the phone (no space, no signal while saving). */
  readonly missing?: boolean;
}

const useStyles = makeStyles((th) => ({
  row: { paddingVertical: th.space['10'] },
  divider: { borderTopWidth: 1, borderTopColor: th.semantic.bg.control },
}));

export function StillWorksList({ lines }: { readonly lines: readonly StillWorksLine[] }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  return (
    <Card testID="trip-offline-still-works">
      <Stack>
        <Text variant="eyebrow" color={theme.semantic.state.success} accessibilityRole="header">
          {upper(t({ id: 'trip.offline.stillWorks', message: 'Still works' }), locale)}
        </Text>
        {lines.map((line, index) => (
          <Row
            key={line.key}
            gap="12"
            align="center"
            style={[styles.row, index === 0 ? null : styles.divider]}
            accessible
            accessibilityLabel={line.text}
          >
            <Icon
              name={line.missing === true ? 'circle' : 'check'}
              size={20}
              decorative
              color={
                line.missing === true ? theme.semantic.text.secondary : theme.semantic.state.success
              }
            />
            <Text
              variant="body"
              color={
                line.missing === true ? theme.semantic.text.secondary : theme.semantic.text.primary
              }
              style={{ flex: 1 }}
            >
              {line.text}
            </Text>
          </Row>
        ))}
      </Stack>
    </Card>
  );
}
