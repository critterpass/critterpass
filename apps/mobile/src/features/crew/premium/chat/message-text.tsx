/**
 * A message's words: `@mentions` stand out (sun yellow on your ink bubble, bold elsewhere), a
 * tombstone reads "Message deleted", and an edited message says so.
 */
import { t } from '@lingui/core/macro';

import { Text, usePremiumTheme } from '@/ui/premium';
import { CHAT_PAINT } from '../premium-paint';

const MENTION = /(@[\p{L}\p{N}_]+)/u;

export function MessageText({
  body,
  tone,
  deleted,
  edited = false,
}: {
  readonly body: string;
  readonly tone: 'mine' | 'theirs' | 'guide';
  readonly deleted: boolean;
  readonly edited?: boolean;
}) {
  const th = usePremiumTheme();
  const color =
    tone === 'mine'
      ? th.color.onInkSurface
      : tone === 'guide'
        ? th.color.banner.guide.text
        : th.color.ink;
  if (deleted) {
    return (
      <Text
        variant="body"
        color={tone === 'mine' ? th.color.onInkSurface : th.color.muted}
        style={{ fontStyle: 'italic' }}
      >
        {t({ id: 'chat.premium.deleted', message: 'Message deleted' })}
      </Text>
    );
  }
  const parts = body.split(MENTION);
  return (
    <Text variant="body" color={color} style={{ lineHeight: 20.7 }}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Text
            key={index}
            variant="body"
            color={tone === 'mine' ? th.accent.sun : color}
            style={{ fontWeight: '600' }}
          >
            {part}
          </Text>
        ) : (
          part
        ),
      )}
      {edited ? (
        <Text
          variant="captionMuted"
          color={tone === 'mine' ? CHAT_PAINT.onInkSoft : th.color.muted}
        >
          {` ${t({ id: 'chat.premium.edited', message: '(edited)' })}`}
        </Text>
      ) : null}
    </Text>
  );
}
