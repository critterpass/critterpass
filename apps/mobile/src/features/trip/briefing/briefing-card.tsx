/**
 * The guide's morning briefing on the hub (3k-1): a yellow card with the guide's sticker, "today"
 * and up to three lines with their chips; or, while it is written, a skeleton; nothing today; a
 * failed build; yesterday's lines while offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import type { GuideId } from '@/ui/people/GuideLine';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { BriefingLine, BriefingState } from './briefing-model';
import { BriefingRow } from './briefing-row';

const STICKER = 40;

export interface BriefingCardProps {
  readonly state: BriefingState;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly onAct: (line: BriefingLine) => void;
}

export function BriefingCard({ state, guide, guideName, onAct }: BriefingCardProps) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  if (state.kind === 'hidden') return null;
  const sticker = GUIDE_STICKERS[guide];
  const ink = theme.semantic.text.onAccent;
  const stale =
    state.kind === 'ready' && state.staleDate !== null
      ? format.date(locale, new Date(`${state.staleDate}T12:00:00Z`), {
          timeZone: 'UTC',
          month: 'short',
          day: 'numeric',
        })
      : null;
  const when =
    stale === null
      ? t({ id: 'trip.briefing.today', message: 'today' })
      : t({ id: 'trip.briefing.fromDate', message: `from ${stale}` });
  return (
    <Card tone="yellow" radius="cardBig" testID={`trip-briefing-${state.kind}`}>
      <Stack gap="4">
        <Row gap="10" align="center">
          <Sticker kind={sticker.kind} name={sticker.name} size={STICKER} />
          <Text variant="title" color={ink} style={{ flex: 1 }}>
            {upper(t({ id: 'trip.briefing.title', message: `${guideName}'s briefing` }), locale)}
          </Text>
          <Text variant="bodySm" color={ink}>
            {when}
          </Text>
        </Row>
        {state.kind === 'generating' ? (
          <Skeleton
            preset="lines"
            label={t({
              id: 'trip.briefing.generating',
              message: `${guideName} is writing today's briefing`,
            })}
          />
        ) : null}
        {state.kind === 'empty' ? (
          <Text variant="body" color={ink}>
            {t({
              id: 'trip.briefing.empty',
              message: 'Nothing needs you today. Enjoy it.',
            })}
          </Text>
        ) : null}
        {state.kind === 'failed' ? (
          <Text variant="body" color={ink}>
            {t({
              id: 'trip.briefing.failed',
              message: "Today's briefing didn't come through. The plan below is up to date.",
            })}
          </Text>
        ) : null}
        {state.kind === 'ready'
          ? state.lines.map((line, index) => (
              <BriefingRow key={line.id} line={line} first={index === 0} onAct={onAct} />
            ))
          : null}
      </Stack>
    </Card>
  );
}
