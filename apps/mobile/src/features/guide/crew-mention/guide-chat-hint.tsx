/**
 * The guide's live line above the crew chat composer (3g-1): its typing dots (the only bouncing
 * element), then its reply typing in word by word until the saved message takes over in the
 * list. A mention refused because today's free answers are spent shows one hint line with the
 * countdown instead.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useLingui } from '@lingui/react/macro';

import { patterns } from '@/motion';
import { Row, Stack, Text, makeStyles, useTheme } from '@/ui';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { TypingDots } from '@/ui/chat/TypingDots';
import { Sticker } from '@/ui/sticker/Sticker';

import { guideAvatarId } from '../chat/components/guide-header';
import { useLiveQuery } from '../chat/data/live-rows';
import { untilReset } from '../meter/meter-model';
import { useMinute } from '../meter/use-guide-meter';
import { useCrewGuideStreams, type LiveGuideReply } from './use-crew-guide-streams';

const GUIDE_SQL = `SELECT g.slug, g.name FROM trips t JOIN guides g ON g.id = t.guide_id
  WHERE t.crew_id = ? AND t.status NOT IN ('archived', 'cancelled')
  ORDER BY t.updated_at DESC LIMIT 1`;

const useStyles = makeStyles((t) => ({
  row: { alignItems: 'flex-end', gap: t.space['8'] },
  bubble: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space['14'],
    paddingVertical: t.space['10'],
    maxWidth: '80%',
  },
}));

function ReplyLine({
  reply,
  slug,
  color,
}: {
  readonly reply: LiveGuideReply | null;
  readonly slug: string;
  readonly color: string;
}) {
  const styles = useStyles();
  const typed = patterns.useTypewriter({ text: reply?.text ?? '' });
  const sticker = GUIDE_STICKERS[guideAvatarId(slug)];
  return (
    <Row style={styles.row} testID={reply === null ? 'guide-crew-typing' : 'guide-crew-reply'}>
      <Sticker kind={sticker.kind} name={sticker.name} size={28} />
      <Stack style={styles.bubble}>
        {reply === null || reply.text === '' ? (
          <TypingDots color={color} />
        ) : (
          <Text variant="voice" color={color}>
            {typed.visibleText}
          </Text>
        )}
      </Stack>
    </Row>
  );
}

export interface GuideChatHintViewProps {
  readonly slug: string;
  readonly guideName: string;
  readonly replies: readonly LiveGuideReply[];
  readonly typing: boolean;
  readonly spentResetAt: string | null | undefined;
  readonly now: Date;
}

export function GuideChatHintView(props: GuideChatHintViewProps) {
  const theme = useTheme();
  const { t } = useLingui();
  const color = theme.guide[guideAvatarId(props.slug)];
  const left = props.spentResetAt ? untilReset(props.spentResetAt, props.now) : null;
  return (
    <Stack gap="8" testID="guide-crew-hint">
      {props.replies.map((reply) => (
        <ReplyLine key={reply.key} reply={reply} slug={props.slug} color={color} />
      ))}
      {props.typing ? <ReplyLine reply={null} slug={props.slug} color={color} /> : null}
      {props.spentResetAt === undefined ? null : (
        <Text variant="bodySm" color={theme.semantic.text.secondary} testID="guide-crew-spent">
          {left === null
            ? t({
                id: 'guide.crew.spentMidnight',
                message: `You've used today's free questions. ${props.guideName} answers again at midnight.`,
              })
            : t({
                id: 'guide.crew.spent',
                message: `You've used today's free questions. ${props.guideName} is back in ${left.hours}h ${left.minutes}m.`,
              })}
        </Text>
      )}
    </Stack>
  );
}

/** Registered as crew chat's composer hint (see ../chat/register.ts). */
export function GuideChatHint({ crewId }: { readonly crewId: string }) {
  const guide = useLiveQuery<{ slug: string; name: string }>(
    GUIDE_SQL,
    [crewId],
    ['trips', 'guides'],
  );
  const streams = useCrewGuideStreams(crewId);
  const now = useMinute();
  const row = guide?.[0];
  if (streams.replies.length === 0 && !streams.typing && streams.spent === null) return null;
  return (
    <GuideChatHintView
      slug={row?.slug ?? 'tokek'}
      guideName={row?.name ?? 'Tokek'}
      replies={streams.replies}
      typing={streams.typing}
      spentResetAt={streams.spent === null ? undefined : streams.spent.resetAt}
      now={now}
    />
  );
}
