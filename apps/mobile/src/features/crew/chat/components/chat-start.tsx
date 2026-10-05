/**
 * The top of a crew's chat, above its first message: the guide waving and one line saying what
 * lands here. It shows once the whole history is loaded, so a chat with a handful of lines does
 * not open on a blank screen with its messages pinned to the bottom (undesigned; logged in
 * docs/undesigned-states.md).
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { guideIdOf } from './empty-chat';

const GUIDE_SIZE = 96;

const useStyles = makeStyles((th) => ({
  start: {
    alignItems: 'center',
    gap: th.space['8'],
    paddingHorizontal: th.space['24'],
    paddingTop: th.space['24'],
    paddingBottom: th.space['16'],
  },
}));

export function ChatStart({
  guideSlug,
  crewName,
}: {
  readonly guideSlug: string | null;
  readonly crewName: string | null;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const sticker = guideSticker(guideIdOf(guideSlug));
  const crew = crewName ?? '';
  return (
    <View style={styles.start} testID="chat-start">
      <Sticker kind={sticker.kind} name={sticker.name} pose="wave" size={GUIDE_SIZE} />
      <Text variant="title" singleLine={false} style={{ textAlign: 'center' }}>
        {crew === ''
          ? t({ id: 'chat.start.titlePlain', message: 'Your crew talks here' })
          : t({ id: 'chat.start.title', message: `${crew} talks here` })}
      </Text>
      <Text
        variant="bodySm"
        color={theme.semantic.text.secondary}
        singleLine={false}
        style={{ textAlign: 'center' }}
      >
        {t({
          id: 'chat.start.line',
          message: 'Votes, the plan, who is in and photos all land in this chat.',
        })}
      </Text>
    </View>
  );
}
