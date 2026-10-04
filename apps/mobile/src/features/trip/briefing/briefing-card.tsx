/**
 * The guide's morning briefing on the hub (3k-1): a yellow card with the guide's sticker, "today"
 * and up to three lines with their chips; or a skeleton while the first local read is pending; one
 * line from the guide when nothing needs me today (and when the next briefing comes); a failed
 * build; yesterday's lines while offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import type { GuideId } from '@/ui/people/GuideLine';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { BriefingLine, BriefingState, NextBriefing } from './briefing-model';
import { BriefingRow } from './briefing-row';

const STICKER = 40;

export interface BriefingCardProps {
  readonly state: BriefingState;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly onAct: (line: BriefingLine) => void;
}

function shortDate(locale: string, date: string): string {
  return format.date(locale, new Date(`${date}T12:00:00Z`), {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

/** The guide's own line when nothing needs me today, with when the next briefing comes. */
function useNothingToday(next: NextBriefing): string {
  const locale = useLocale();
  const { t } = useLingui();
  if (next === null) {
    return t({ id: 'trip.briefing.empty', message: 'Nothing needs you today. Enjoy it.' });
  }
  if (next.on === 'today') {
    return t({
      id: 'trip.briefing.noneYet',
      message: "Nothing from me yet. Today's briefing comes this morning.",
    });
  }
  if (next.on === 'tomorrow') {
    return t({
      id: 'trip.briefing.noneTomorrow',
      message: "Nothing needs you today. I'll check again tomorrow morning.",
    });
  }
  const start = shortDate(locale, next.date);
  return t({
    id: 'trip.briefing.noneFrom',
    message: `Nothing needs you today. My morning briefings start ${start}.`,
  });
}

export function BriefingCard({ state, guide, guideName, onAct }: BriefingCardProps) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const sticker = guideSticker(guide);
  const ink = theme.semantic.text.onAccent;
  const nothing = useNothingToday(state.kind === 'none' ? state.next : null);
  const stale =
    state.kind === 'ready' && state.staleDate !== null ? shortDate(locale, state.staleDate) : null;
  const when =
    stale === null
      ? t({ id: 'trip.briefing.today', message: 'today' })
      : t({ id: 'trip.briefing.fromDate', message: `from ${stale}` });
  if (state.kind === 'hidden') return null;
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
        {state.kind === 'loading' ? (
          <Skeleton
            preset="lines"
            label={t({ id: 'trip.briefing.loading', message: `Loading ${guideName}'s briefing` })}
          />
        ) : null}
        {state.kind === 'none' ? (
          <Text variant="body" color={ink} testID="trip-briefing-none-line">
            {nothing}
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
