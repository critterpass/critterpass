/**
 * The hub's compact row (3k-1): what comes next in this phase under the header (the first day and
 * its pack list before the trip, my flight on a travel day, today's leave-by or next stop during
 * it) and the way into Explore under the tiles. An icon, a caps label carrying its day or time, a
 * title, one line and a chevron; a row with nowhere to go yet draws no chevron and takes no tap.
 */
import { upper } from '@cp/i18n';
import { I18nManager } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card } from '@/ui/cards/Card';
import type { DoodleName } from '@/ui/icons/generated';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface HubNext {
  readonly icon: DoodleName;
  /** "First day · Oct 21", "Tomorrow · 10:00": what it is and when. */
  readonly label: string | null;
  readonly title: string;
  readonly detail: string | null;
  readonly tone: 'raised' | 'pink';
  readonly testID: string;
  /** Null while the row's screen is not there to open. */
  readonly onPress: (() => void) | null;
}

const useStyles = makeStyles((th) => ({
  card: { paddingVertical: th.space['10'] },
  body: { flex: 1, minWidth: 0 },
}));

export function NextRow({ next }: { readonly next: HubNext }) {
  const theme = useTheme();
  const styles = useStyles();
  const locale = useLocale();
  const accent = next.tone === 'pink';
  const ink = accent ? theme.semantic.text.onAccent : theme.semantic.text.primary;
  const quiet = accent ? theme.semantic.text.onAccent : theme.semantic.text.secondary;
  return (
    <Card
      tone={next.tone}
      halftone={accent}
      {...(next.onPress === null ? {} : { onPress: next.onPress })}
      accessibilityLabel={[next.label, next.title, next.detail].filter(Boolean).join(', ')}
      style={styles.card}
      testID={next.testID}
    >
      <Row gap="12" align="center">
        <Icon name={next.icon} size={24} decorative color={ink} />
        <Stack gap="2" style={styles.body}>
          {next.label === null ? null : (
            <Text variant="eyebrow" color={quiet}>
              {upper(next.label, locale)}
            </Text>
          )}
          <Text variant="title" color={ink}>
            {upper(next.title, locale)}
          </Text>
          {next.detail === null ? null : (
            <Text variant="bodySm" color={quiet}>
              {next.detail}
            </Text>
          )}
        </Stack>
        {next.onPress === null ? null : (
          <Text variant="title" color={quiet} accessibilityElementsHidden>
            {I18nManager.isRTL ? '‹' : '›'}
          </Text>
        )}
      </Row>
    </Card>
  );
}
