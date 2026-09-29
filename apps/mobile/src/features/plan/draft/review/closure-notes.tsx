/**
 * Closures the pre-draft check found on the trip dates, each with the page it came from: "Closed
 * Apr 4–6: Nishiki Market · Source". Undesigned: caption lines under the day list.
 */
import type { ClosureRecord } from '@cp/domain';
import { t } from '@lingui/core/macro';
import * as Linking from 'expo-linking';
import { View } from 'react-native';

import { TextLink } from '@/ui/buttons/TextLink';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dayRange } from '../data/format';

const useStyles = makeStyles((th) => ({
  list: { gap: th.space['4'] },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: th.space['6'] },
}));

export function ClosureNotes({
  closures,
  locale,
}: {
  readonly closures: readonly ClosureRecord[];
  readonly locale: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  if (closures.length === 0) return null;
  return (
    <View style={styles.list} testID="draft-closures">
      {closures.map((closure) => {
        const when = dayRange(locale, closure.closed_from, closure.closed_to);
        const area = closure.area;
        return (
          <View key={`${closure.area}-${closure.closed_from}`} style={styles.row}>
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {t({ id: 'planDraft.closure.line', message: `Closed ${when}: ${area}` })}
            </Text>
            <TextLink
              label={t({ id: 'planDraft.closure.source', message: 'Source' })}
              onPress={() => void Linking.openURL(closure.source_url)}
            />
          </View>
        );
      })}
    </View>
  );
}
