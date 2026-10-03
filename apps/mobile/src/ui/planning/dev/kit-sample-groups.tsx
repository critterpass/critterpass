/**
 * Larger planning kit samples (place rows, a day timeline, whole-trip rows, a split's options)
 * for `kit-samples.tsx`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- lab sample copy, loaded only by (dev) screens. */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react';
import { useState } from 'react';
import { View } from 'react-native';

import type { StackMember } from '../../people/AvatarStack';
import { AddButton } from '../add-button';
import { PlanningDayRow } from '../day-row';
import { GapSlot } from '../gap-slot';
import { OptionRadioCard } from '../option-radio-card';
import { PaceBars } from '../pace-bars';
import { PlaceRow } from '../place-row';
import { PlanningTag } from '../planning-tag';
import { LegConnector, TimedStop } from '../stop-card';

const { color } = tokens;
const noop = () => undefined;

export function useVi(): boolean {
  return useLingui().i18n.locale.startsWith('vi');
}

const face = (name: string, joinIndex: number): StackMember => ({ key: name, name, joinIndex });
export const ALEX = face('Alex', 2);
export const RIN = face('Rin', 3);
export const DANI = face('Dani', 4);
export const MAYA = face('Maya', 1);
export const JORDAN = face('Jordan', 0);

export function OptionsSample() {
  const vi = useVi();
  const [picked, setPicked] = useState(0);
  return (
    <View style={{ gap: tokens.space['10'] }}>
      <OptionRadioCard
        title={vi ? 'Ai thích thì đi sớm' : 'Keen ones go early'}
        body={
          vi
            ? 'Maya và Jordan đi lúc 04:30 thứ Bảy với Made, về trước 13:00. Mọi người khác ngủ tiếp.'
            : 'Maya and Jordan leave Sat at 04:30 with Made and are back by 13:00. Everyone else sleeps in.'
        }
        tags={vi ? ['Rp 450K, xe', '2 người đi'] : ['Rp 450K, the car', '2 going']}
        selected={picked === 0}
        onSelect={() => setPicked(0)}
      />
      <OptionRadioCard
        title={vi ? 'Đổi sang Tirta Gangga' : 'Tirta Gangga instead'}
        body={
          vi
            ? 'Cùng quãng đường, cung điện nước, không xếp hàng.'
            : 'Same drive, a water palace, no queue.'
        }
        tags={vi ? ['Cả 6'] : ['All 6']}
        selected={picked === 1}
        onSelect={() => setPicked(1)}
      />
    </View>
  );
}

export function PlaceRowsSample() {
  const vi = useVi();
  return (
    <View>
      <PlaceRow
        title="Tirta Empul"
        meta={vi ? 'Đền nước · 45 phút · Rp 75k' : 'Water temple · 45 min · Rp 75k'}
        icon="temple"
        savers={[ALEX, RIN]}
        fitLine={{ text: vi ? 'Hợp T7 lúc 08:00' : 'Fits Sat at 08:00', tone: 'fits' }}
        trailing={<AddButton accessibilityLabel="Add Tirta Empul" onPress={noop} />}
        onPress={noop}
      />
      <PlaceRow
        title="Pura Lempuyang"
        meta="Gates of Heaven · 2h20 · photo queue"
        icon="temple"
        savers={[MAYA, JORDAN]}
        fitLine={{ text: vi ? 'Cả nhóm chia đôi 2–2' : 'The crew is split 2–2', tone: 'split' }}
        trailing={<PlanningTag label="Split" color={color.pink} />}
        onPress={noop}
      />
      <PlaceRow
        title="Sari Organik"
        icon="food"
        savers={[MAYA]}
        saversAtEnd
        fitLine={{
          text: vi ? 'Chỉ hợp nếu dời bữa trưa T4' : 'Only fits if Wed lunch moves',
          tone: 'needsMove',
        }}
        onPress={noop}
      />
    </View>
  );
}

export function TimelineSample() {
  return (
    <View style={{ gap: tokens.space['4'] }}>
      <TimedStop
        time="09:00"
        length="3h30"
        n={1}
        title="Jatiluwih terraces"
        detail="Made drives · 1h10 each way"
        color={color.blue}
      />
      <LegConnector label="Car · 1h10" />
      <TimedStop
        time="13:00"
        length="1h"
        n={2}
        title="Lunch · Biah Biah"
        detail="4 of 6 voted · Rp 60k each"
        color={color.blue}
        trailing={<PlanningTag label="Vote" />}
      />
      <LegConnector label="Car · 12 min" />
      <TimedStop
        time="14:00"
        length="1h30"
        n={3}
        title="Campuhan Ridge walk"
        detail="Rain likely 13–15"
        color={color.blue}
        outlined
      />
      <GapSlot time="16:00" text="Four of you are free till 19:00" onAdd={noop} />
    </View>
  );
}

export function DayRowsSample() {
  return (
    <View style={{ gap: tokens.space['8'] }}>
      <PlanningDayRow
        dayNo={1}
        weekday="Mon"
        color={color.yellow}
        title="Arrive + pool"
        summary="Made at 11:40 · villa from 15:00"
        tag={<PlanningTag label="Booked" color={color.green.base} />}
        pace={<PaceBars level={1} color={color.yellow} accessibilityLabel="Light day" />}
        accessibilityLabel="Day 1, Arrive and pool"
        onPress={noop}
      />
      <PlanningDayRow
        dayNo={2}
        weekday="Tue"
        color={color.pink}
        title="Ubud centre"
        summary="Cooking class · Monkey Forest"
        tag={<PlanningTag label="Clash" color={color.pink} />}
        pace={<PaceBars level={5} color={color.pink} accessibilityLabel="Packed day" />}
        accessibilityLabel="Day 2, Ubud centre"
        onPress={noop}
      />
      <PlanningDayRow
        dayNo={7}
        weekday="Sun"
        color={color.yellow}
        title="Uluwatu"
        summary="Temple at sunset · kecak"
        tag={<PlanningTag label="Too far" color={color.orange} />}
        pace={<PaceBars level={3} color={color.yellow} accessibilityLabel="Busy day" />}
        accessibilityLabel="Day 7, Uluwatu"
        onPress={noop}
      />
    </View>
  );
}
