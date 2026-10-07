/**
 * The guide sheet's header (3j-1, 4b-1): the guide's sticker and name, the mode line ("Group mode ·
 * all six can see this", "Just me · Kyoto, Apr 2–9"), the GROUP / JUST ME switch when there is a
 * trip to share with, then the line that says the guide is an AI on a row of its own, and the
 * meter chip.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl format options, never copy. */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { GuideThreadMode } from '@cp/domain';
import { upper } from '@cp/i18n';

import { Row, Stack, Text, makeStyles, useTheme } from '@/ui';
import { guideSticker, isGuideStickerId, type GuideStickerId } from '@/ui/avatar/guides';
import { Segmented } from '@/ui/inputs/Segmented';
import { Sticker } from '@/ui/sticker/Sticker';

import type { GuideTripContext } from '../data/use-guide-context';

const useStyles = makeStyles((t) => ({
  root: { alignItems: 'center', gap: t.space['12'] },
  modes: { flexShrink: 0 },
}));

export function guideAvatarId(slug: string): GuideStickerId {
  return isGuideStickerId(slug) ? slug : 'tokek';
}

function dateRange(start: string | null, end: string | null, locale: string): string | null {
  if (start === null) return null;
  const fmt = (iso: string, withMonth: boolean) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      ...(withMonth ? { month: 'short' } : {}),
      timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`));
  if (end === null || end === start) return fmt(start, true);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${fmt(start, true)}–${sameMonth ? fmt(end, false) : fmt(end, true)}`;
}

export function useModeLine(mode: GuideThreadMode, trip: GuideTripContext | null): string {
  const { t, i18n } = useLingui();
  if (mode === 'group' && trip !== null) {
    const count = trip.crewSize;
    return t({
      id: 'guide.header.group',
      message: `Group mode · all ${count} can see this`,
    });
  }
  const dates = trip === null ? null : dateRange(trip.startDate, trip.endDate, i18n.locale);
  const place = [trip?.destination ?? null, dates].filter(Boolean).join(', ');
  return place === ''
    ? t({ id: 'guide.header.private', message: 'Just me · only you can see this' })
    : t({ id: 'guide.header.privateTrip', message: `Just me · ${place}` });
}

export interface GuideHeaderProps {
  readonly guideSlug: string;
  readonly guideName: string;
  readonly modeLine: string;
  readonly mode: GuideThreadMode;
  /** Absent when there is no trip: the home guide only talks one to one. */
  readonly onMode?: (mode: GuideThreadMode) => void;
  readonly meter?: ReactNode;
}

export function GuideHeader({
  guideSlug,
  guideName,
  modeLine,
  mode,
  onMode,
  meter,
}: GuideHeaderProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const sticker = guideSticker(guideAvatarId(guideSlug));
  return (
    <Stack gap="8" testID="guide-header">
      <Row style={styles.root}>
        <Sticker kind={sticker.kind} name={sticker.name} size={56} />
        <Stack gap="2" flex={1}>
          <Text variant="h2" accessibilityRole="header">
            {upper(guideName, i18n.locale)}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary} singleLine={false}>
            {modeLine}
          </Text>
        </Stack>
        {onMode === undefined ? null : (
          <View style={styles.modes}>
            <Segmented
              label={t({ id: 'guide.header.modes', message: 'Who sees this chat' })}
              value={mode}
              onChange={onMode}
              segments={[
                { value: 'group', label: t({ id: 'guide.header.groupTab', message: 'Group' }) },
                { value: 'private', label: t({ id: 'guide.header.meTab', message: 'Just me' }) },
              ]}
              testID="guide-modes"
            />
          </View>
        )}
      </Row>
      {/* Its own row under the header, so it never squeezes the mode line beside the switch. */}
      <Text
        variant="caption"
        color={theme.semantic.text.tertiary}
        singleLine={false}
        testID="guide-ai-label"
      >
        {t({
          id: 'guide.header.ai',
          message: 'AI guide · answers can be wrong, check what matters',
        })}
      </Text>
      {meter}
    </Stack>
  );
}
