/**
 * A brand-new crew's chat: the guide says hello and the first message is one tap away ("Say hi to
 * the crew", the same line the "you're in" screen ends on).
 */
import { t } from '@lingui/core/macro';

import { isGuideStickerId, type GuideStickerId } from '@/ui/avatar/guides';
import { EmptyState } from '@/ui/states/EmptyState';

/** A known guide id for the slug, else Tokek (the default companion). */
export function guideIdOf(slug: string | null | undefined): GuideStickerId {
  return isGuideStickerId(slug) ? slug : 'tokek';
}

export function EmptyChat({
  guideSlug,
  guideName,
  onSayHi,
}: {
  readonly guideSlug: string | null;
  readonly guideName: string;
  readonly onSayHi: () => void;
}) {
  return (
    <EmptyState
      guide={guideIdOf(guideSlug)}
      guideName={guideName}
      title={t({ id: 'chat.empty.title', message: 'Say hi to the crew' })}
      line={t({
        id: 'chat.empty.line',
        message: 'Plans, photos and votes all land here. Start with a hello.',
      })}
      action={{ label: t({ id: 'chat.empty.action', message: 'Say hi' }), onPress: onSayHi }}
      testID="chat-empty"
    />
  );
}
