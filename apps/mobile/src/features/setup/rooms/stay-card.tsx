/**
 * One stay of the rooms plan (3c-6): a colour card ("RYOKAN" · "APR 2–4 · 2 NIGHTS") with its
 * rooms. A later stay that keeps the first stay's pairs shows one line instead of the rows, and
 * (organiser) a switch to set its rooms separately. An imported booking adds its free-cancellation
 * date; nothing here claims a hold.
 */
/* eslint-disable lingui/no-unlocalized-strings -- card tone keys, never copy. */
import { t } from '@lingui/core/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card } from '@/ui/cards/Card';
import { cardBackground, type CardTone } from '@/ui/cards/tone';
import { Toggle } from '@/ui/inputs/Toggle';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';
import { format } from '@cp/i18n';

import { dayRange } from '../data/date-range';
import { stayName } from './copy';
import type { PlanStay } from './model';
import { RoomRow, type RoomRowPerson } from './room-row';

const TONES: readonly CardTone[] = ['pink', 'blue', 'green', 'orange', 'yellow', 'cream'];

export function toneOf(index: number): CardTone {
  return TONES[index % TONES.length] ?? 'pink';
}

function day(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export interface StayCardProps {
  readonly index: number;
  readonly stay: PlanStay;
  readonly firstStayType: string;
  readonly dates: { readonly from: string; readonly to: string } | null;
  /** This stay copies the first stay's pairs (shown as one line). */
  readonly mirrored: boolean;
  readonly people: ReadonlyMap<string, RoomRowPerson>;
  readonly me: string;
  readonly editable: boolean;
  readonly selectedUid: string | null;
  readonly rejected: { readonly roomKey: string; readonly count: number } | null;
  readonly freeCancelUntil: string | null;
  readonly onSelect: (uid: string) => void;
  readonly onMoveHere: (stayKey: string, roomKey: string) => void;
  readonly onLift: () => void;
  readonly onDrop: (stayKey: string, uid: string, x: number, y: number) => void;
  readonly onMeasure: (
    stayKey: string,
    roomKey: string,
    rect: { x: number; y: number; width: number; height: number },
  ) => void;
  readonly onSeparate?: ((separate: boolean) => void) | undefined;
}

export function StayCard({
  index,
  stay,
  firstStayType,
  dates,
  mirrored,
  people,
  me,
  editable,
  selectedUid,
  rejected,
  freeCancelUntil,
  onSelect,
  onMoveHere,
  onLift,
  onDrop,
  onMeasure,
  onSeparate,
}: StayCardProps) {
  const theme = useTheme();
  const locale = useLocale();
  const tone = toneOf(index);
  const accent = cardBackground(theme, tone);
  const nights = stay.nights;
  const range = dates === null ? null : dayRange(locale, dates.from, dates.to);
  const when =
    range === null
      ? t({ id: 'setup.rooms.nights', message: `${nights} nights` })
      : t({ id: 'setup.rooms.datesNights', message: `${range} · ${nights} nights` });
  const rooms = stay.rooms.length;
  const first = stayName(firstStayType).toLocaleLowerCase(locale);
  const until =
    freeCancelUntil === null
      ? null
      : format.date(locale, day(freeCancelUntil.slice(0, 10)), {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        });
  return (
    <Card tone={tone} radius="cardBig" testID={`setup-rooms-stay-${stay.key}`}>
      <Stack gap="10">
        <Row justify="space-between" align="center" gap="8">
          <Text variant="h3" accessibilityRole="header">
            {stayName(stay.type)}
          </Text>
          <Text variant="label">{when}</Text>
        </Row>
        {mirrored ? (
          <Text variant="body" testID={`setup-rooms-mirrored-${stay.key}`}>
            {t({
              id: 'setup.rooms.samePairs',
              message: `${rooms} rooms. Same pairs as the ${first}.`,
            })}
          </Text>
        ) : (
          <Stack gap="6">
            {stay.rooms.map((room, roomIndex) => (
              <RoomRow
                key={room.key}
                index={roomIndex}
                room={room}
                people={people}
                accent={accent}
                editable={editable}
                selectedUid={selectedUid}
                mine={!editable && room.occupants.includes(me)}
                rejectCount={rejected?.roomKey === room.key ? rejected.count : 0}
                onSelect={onSelect}
                onMoveHere={() => onMoveHere(stay.key, room.key)}
                onLift={onLift}
                onDrop={(uid, x, y) => onDrop(stay.key, uid, x, y)}
                onMeasure={(rect) => onMeasure(stay.key, room.key, rect)}
              />
            ))}
          </Stack>
        )}
        {index > 0 && onSeparate !== undefined ? (
          <Row justify="space-between" align="center" gap="12">
            <Text variant="bodySm" style={{ flexShrink: 1 }}>
              {t({ id: 'setup.rooms.separate', message: 'Set these rooms separately' })}
            </Text>
            <Toggle
              value={!mirrored}
              onValueChange={onSeparate}
              label={t({ id: 'setup.rooms.separate', message: 'Set these rooms separately' })}
              testID={`setup-rooms-separate-${stay.key}`}
            />
          </Row>
        ) : null}
        {until !== null && index === 0 ? (
          <Text variant="bodySm" testID="setup-rooms-free-cancel">
            {t({
              id: 'setup.rooms.freeCancel',
              message: `Free cancellation until ${until}`,
            })}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}
