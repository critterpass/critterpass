/** A `system` row: a centred caption for joins, departures and renames. */
import { View } from 'react-native';

import { Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import { systemLine } from '../components/system-line';
import type { ChatMessage } from '../data/rows';

const useStyles = makeStyles((th) => ({
  row: { alignSelf: 'center', paddingVertical: th.space['6'], paddingHorizontal: th.space['24'] },
}));

export function SystemCard({ message }: { readonly message: ChatMessage }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.row} testID={`chat-system-${message.id}`}>
      <Text variant="caption" color={theme.semantic.text.secondary} style={{ textAlign: 'center' }}>
        {systemLine(message.refKind, message.refName, message.body)}
      </Text>
    </View>
  );
}
