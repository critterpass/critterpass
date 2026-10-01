/**
 * The crew area's public surface for other features: crew chat's card and "+" menu registries (a
 * feature that posts its own card type, a poll or an expense, renders it and adds its entry here),
 * and the waitlist cards Home shows for its crew's trips.
 */
export { registerChatCard, type ChatCardProps, type ChatCardRenderer } from './chat/cards/registry';
export { registerAttachEntry, type AttachEntry } from './chat/media/attach-menu';
export type { ChatMessage } from './chat/data/rows';
export { registerChatComposerHint } from './chat/slots';
export { tidyGuideText } from './chat/components/guide-text';
export { WaitlistCards } from './waitlist/WaitlistCards';
