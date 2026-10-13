/**
 * The guide's live line in the premium crew chat, under the messages (undesigned beyond the
 * typing bubble, 5.12; built from the chat's guide bubble): its reply typing in word by word to
 * the asker's own @mention until the saved message takes over in the list, and, when a mention was
 * refused because today's free answers are spent, one line with the countdown until the meter has
 * answers again. The typing dots stay the chat's own.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { patterns } from '@/motion';
import { Text, makePremiumStyles } from '@/ui/premium';

import { useLiveQuery } from '../../chat/data/live-rows';
import type { LiveGuideReply } from '../../crew-mention/use-crew-guide-streams';
import { useCrewGuideStreams } from '../../crew-mention/use-crew-guide-streams';
import { isSpent, untilReset } from '../../meter/meter-model';
import { useGuideMeter, useMinute } from '../../meter/use-guide-meter';

const GUIDE_SQL = `SELECT t.id, g.name FROM trips t JOIN guides g ON g.id = t.guide_id
  WHERE t.crew_id = ? AND t.status NOT IN ('archived', 'cancelled')
  ORDER BY t.updated_at DESC LIMIT 1`;

const useStyles = makePremiumStyles((th) => ({
  bubble: {
    alignSelf: 'flex-start',
    width: 282,
    maxWidth: '100%',
    backgroundColor: th.color.banner.guide.bg,
    borderRadius: th.radius.card,
    paddingVertical: th.space.gap12,
    paddingHorizontal: th.space.gap14,
    gap: th.space.gap4,
  },
}));

function StreamedReply({
  reply,
  guideName,
}: {
  readonly reply: LiveGuideReply;
  readonly guideName: string;
}) {
  const styles = useStyles();
  const typed = patterns.useTypewriter({ text: reply.text });
  return (
    <View style={styles.bubble} testID="guide-crew-reply">
      <Text variant="guideName" tone="guideName">
        {guideName}
      </Text>
      <Text variant="body">{typed.visibleText}</Text>
    </View>
  );
}

/** Registered as crew chat's composer hint (see ../../chat/register.ts). */
export function PremiumGuideChatHint({ crewId }: { readonly crewId: string }) {
  const guide = useLiveQuery<{ id: string; name: string }>(
    GUIDE_SQL,
    [crewId],
    ['trips', 'guides'],
  );
  const streams = useCrewGuideStreams(crewId);
  const now = useMinute();
  const row = guide?.[0];
  // The refusal holds only while the meter is still spent: midnight, a pass or a boost lifts it.
  const meter = useGuideMeter(row?.id ?? null, { live: null, spent: streams.spent });
  const spent = streams.spent !== null && isSpent(meter) ? streams.spent : null;
  const replies = streams.replies.filter((reply) => reply.text !== '');
  if (replies.length === 0 && spent === null) return null;
  const guideName = row?.name ?? 'Tokek';
  const left = spent?.resetAt ? untilReset(spent.resetAt, now) : null;
  return (
    <View style={{ gap: 8, paddingVertical: 4 }} testID="guide-crew-hint">
      {replies.map((reply) => (
        <StreamedReply key={reply.key} reply={reply} guideName={guideName} />
      ))}
      {spent === null ? null : (
        <Text variant="captionMuted" tone="muted" testID="guide-crew-spent">
          {left === null
            ? t({
                id: 'guide.premium.crew.spentMidnight',
                message: `You've used today's free questions. ${guideName} answers again at midnight.`,
              })
            : t({
                id: 'guide.premium.crew.spent',
                message: `You've used today's free questions. ${guideName} is back in ${left.hours}h ${left.minutes}m.`,
              })}
        </Text>
      )}
    </View>
  );
}
