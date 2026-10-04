/** KNOW BEFORE YOU GO (7e-2): approved lines about the place, each a title with an optional detail. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  card: {
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    paddingHorizontal: t.space['14'],
  },
  row: { paddingVertical: t.space['12'], gap: t.space['2'] },
  divider: { borderTopWidth: 1, borderTopColor: t.color.divider },
}));

export function KnowBefore({
  lines,
}: {
  readonly lines: readonly { readonly title: string; readonly detail: string | null }[];
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  if (lines.length === 0) return null;
  return (
    <View style={{ gap: theme.space['8'] }} testID="place-detail-know">
      <Text variant="eyebrow" color={theme.semantic.text.secondary}>
        {upper(t({ id: 'explore.detail.know', message: 'Know before you go' }), i18n.locale)}
      </Text>
      <View style={styles.card}>
        {lines.map((line, index) => (
          <View key={line.title} style={[styles.row, index === 0 ? null : styles.divider]}>
            <Text variant="rowTitle" singleLine={false}>
              {line.title}
            </Text>
            {line.detail === null ? null : (
              <Text variant="bodySm" color={theme.semantic.text.secondary} singleLine={false}>
                {line.detail}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
