/**
 * Photo, voice-note and sticker messages render through the chat's card registry like any other
 * card.
 */
import { registerChatCard } from '../cards/registry';
import { STICKER_MESSAGE_SIZE, StickerCard, stickerLabel } from '../cards/sticker-card';
import { PhotoMessage, photoLabel } from './photo-message';
import { VoiceMessage, voiceLabel } from './voice-message';

registerChatCard('photo', {
  Component: PhotoMessage,
  estimateHeight: (message) => (message.attachments.length > 1 ? 240 : 280),
  a11yLabel: (message) => photoLabel(message.attachments.length, message.body),
});

registerChatCard('voice', {
  Component: VoiceMessage,
  estimateHeight: () => 64,
  a11yLabel: (message) => voiceLabel(message.attachments[0]?.duration_ms ?? 0),
});

registerChatCard('sticker', {
  Component: StickerCard,
  estimateHeight: () => STICKER_MESSAGE_SIZE + 32,
  a11yLabel: (message) => stickerLabel(message.body),
});
