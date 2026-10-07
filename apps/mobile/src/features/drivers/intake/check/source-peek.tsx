/** The peek bar of a card line (6c-2): the words it was read from, marked in the shared message. */
import type { SourceSpan } from '@cp/domain';
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  peek: { backgroundColor: t.color.paper.base, borderRadius: t.radius.md, padding: t.space['12'] },
}));

export function SourcePeek({
  source,
  span,
}: {
  readonly source: string;
  readonly span: SourceSpan;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.peek} testID="drivers-check-peek">
      <Text variant="bodySm" color={theme.color.paper.ink}>
        {source.slice(Math.max(0, span[0] - 40), span[0])}
        <Text
          variant="bodySm"
          color={theme.color.paper.ink}
          style={{ backgroundColor: theme.color.yellow }}
        >
          {source.slice(span[0], span[1])}
        </Text>
        {source.slice(span[1], span[1] + 40)}
      </Text>
    </View>
  );
}
