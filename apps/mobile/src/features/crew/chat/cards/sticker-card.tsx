/**
 * A critter sticker message: the form's sticker with its pose caption, no bubble. A sticker whose
 * form is not on the phone yet shows only its caption until the catalogue syncs.
 */
import { t } from '@lingui/core/macro';

import { FormSticker } from '@/features/critters';
import { Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import type { ChatCardProps } from './registry';
import { isStickerPose, stickerCaption } from './sticker-caption';

export const STICKER_MESSAGE_SIZE = 112;

const useStyles = makeStyles((th) => ({
  sticker: { alignItems: 'center', gap: th.space['4'] },
}));

export function stickerLabel(pose: string): string {
  const caption = isStickerPose(pose) ? stickerCaption(pose) : '';
  return t({ id: 'chat.sticker.a11y', message: `Sticker: ${caption}` });
}

export function StickerCard({ message }: ChatCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  if (message.deleted || message.refId === null || !isStickerPose(message.body)) return null;
  return (
    <Stack style={styles.sticker} testID={`chat-sticker-${message.id}`}>
      <FormSticker form={message.refId} size={STICKER_MESSAGE_SIZE} pose={message.body} />
      <Text variant="label" color={theme.semantic.text.secondary}>
        {stickerCaption(message.body)}
      </Text>
    </Stack>
  );
}
