/**
 * The guide's morning briefing on the hub (3k-1): a yellow card with the guide's sticker, "today"
 * and up to three lines with their chips; or a skeleton while the first local read is pending; one
 * line from the guide when the briefing has nothing new (and when the next one comes); a failed
 * build; yesterday's lines while offline.
 */
import { upper } from '@cp/i18n';
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

import { briefingDate, useNothingToday } from './briefing-copy';
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
  const sticker = guideSticker(guide);
  const ink = theme.semantic.text.onAccent;
  const nothing = useNothingToday(state.kind === 'none' ? state.next : null);
  const stale =
    state.kind === 'ready' && state.staleDate !== null ? briefingDate(locale, state.staleDate) : null;
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
          {/* With nothing written for today the body says when the next one comes. */}
          {state.kind === 'none' ? null : (
            <Text variant="bodySm" color={ink}>
              {when}
            </Text>
          )}
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
