/** The "NEW" rule above the first unread message. */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Row, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  row: { alignItems: 'center', gap: th.space['8'], paddingVertical: th.space['8'] },
  rule: { flex: 1, height: 1 },
}));

export function UnreadDivider() {
  const styles = useStyles();
  const theme = useTheme();
  const rule = [styles.rule, { backgroundColor: theme.semantic.state.urgent }];
  return (
    <Row style={styles.row} testID="chat-unread-divider">
      <View style={rule} />
      <Text variant="eyebrow" color={theme.semantic.state.urgent}>
        {t({ id: 'chat.unread.divider', message: 'New' })}
      </Text>
      <View style={rule} />
    </Row>
  );
}
