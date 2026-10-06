/**
 * The crew area's public surface for other features: crew chat's card and "+" menu registries (a
 * feature that posts its own card type, a poll or an expense, renders it and adds its entry here),
 * the waitlist cards Home shows for its crew's trips, the crew map's slots for its boost offer (the
 * monetisation area registers it) and the lock-screen Live Activity starter (the Live Activity
 * area registers it), and the media api client (uploads
 * and signed read URLs) the album shares with chat.
 */
export { registerChatCard, type ChatCardProps, type ChatCardRenderer } from './chat/cards/registry';
export { registerAttachEntry, type AttachEntry } from './chat/media/attach-menu';
export type { MediaHttp, PickedPhoto } from './chat/media/media-services';
export { readUrl, useReadUrl } from './chat/media/read-urls';
export { uploadAttachment, type UploadInput, type UploadOutcome } from './chat/media/upload';
export type { ChatMessage } from './chat/data/rows';
export { registerChatComposerHint } from './chat/slots';
export { tidyGuideText } from './chat/components/guide-text';
export { WaitlistCards } from './waitlist/WaitlistCards';
export { registerLiveMapPaywall, registerLockScreenStarter } from './live-map/gate-slot';
