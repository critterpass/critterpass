/** Opening a messaging app with an invite's message already written. */
/* eslint-disable lingui/no-unlocalized-strings -- channel tags and URL schemes, never copy. */
export type ComposerChannel = 'wa' | 'imsg' | 'copy' | 'qr' | 'share';

/** The compose URL of a messaging channel, or null for copy and the share sheet. */
export function composeUrl(channel: ComposerChannel, message: string): string | null {
  const text = encodeURIComponent(message);
  if (channel === 'wa') return `whatsapp://send?text=${text}`;
  if (channel === 'imsg') return `sms:&body=${text}`;
  return null;
}
