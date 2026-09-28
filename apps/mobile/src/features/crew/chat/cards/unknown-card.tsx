/**
 * The neutral card for a message this build cannot draw (a type added in a newer app, or one whose
 * feature has not registered a card): it says so plainly and links to getting the update.
 */
import { t } from '@lingui/core/macro';
import { Linking } from 'react-native';

import { InlineAction } from '@/ui/buttons/InlineAction';
import { Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import type { ChatMessage } from '../data/rows';

/** Opens the app's download page, which sends each platform to its store listing. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a URL, never copy.
export const APP_UPDATE_URL = 'https://critterpass.app/app';

const useStyles = makeStyles((th) => ({
  card: {
    gap: th.space['8'],
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    borderWidth: 1,
    borderColor: th.semantic.border.decorative,
    backgroundColor: th.semantic.bg.raised,
    maxWidth: '82%',
  },
}));

export function UnknownCard({ message }: { readonly message: ChatMessage }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack style={styles.card} testID={`chat-unknown-${message.id}`}>
      <Text variant="body">
        {t({ id: 'chat.card.unknown.title', message: 'This message needs a newer CritterPass' })}
      </Text>
      <Text variant="caption" color={theme.semantic.text.secondary}>
        {t({ id: 'chat.card.unknown.line', message: 'Update the app to see it here.' })}
      </Text>
      <InlineAction
        label={t({ id: 'chat.card.unknown.action', message: 'Open in app update' })}
        onPress={() => void Linking.openURL(APP_UPDATE_URL)}
      />
    </Stack>
  );
}
