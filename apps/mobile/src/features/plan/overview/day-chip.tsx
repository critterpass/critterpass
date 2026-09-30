/**
 * A day card's trailing chip on 3e-1: BOOKED, "{n} VOTE" (pulsing softly while the vote is open)
 * or the day's weather doodle.
 */
import { plural, t } from '@lingui/core/macro';
import Animated from 'react-native-reanimated';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { useLoop } from '@/motion/use-loop';
import { StatusChip } from '@/ui/chips/StatusChip';
import { Icon } from '@/ui/icons/Icon';
import { useTheme } from '@/ui/theme';

import type { DayChip as DayChipModel, WeatherIcon } from './model/plan-model';

export function weatherLabel(icon: WeatherIcon): string {
  switch (icon) {
    case 'rain':
      return t({ id: 'plan.overview.weather.rain', message: 'Rain likely' });
    case 'sun':
      return t({ id: 'plan.overview.weather.sun', message: 'Dry' });
    case 'wave':
      return t({ id: 'plan.overview.weather.wave', message: 'Beach weather' });
  }
}

/** The chip's words for screen readers (the chip itself is hidden from them). */
export function dayChipLabel(chip: DayChipModel): string | undefined {
  if (chip === null) return undefined;
  if (chip.kind === 'booked') return t({ id: 'plan.overview.chip.booked', message: 'Booked' });
  if (chip.kind === 'vote') return voteWord(chip.ballots);
  return weatherLabel(chip.icon);
}

function voteWord(ballots: number): string {
  return ballots > 0
    ? t({
        id: 'plan.overview.chip.votes',
        message: plural(ballots, { one: '# vote', other: '# votes' }),
      })
    : t({ id: 'plan.overview.chip.vote', message: 'Vote' });
}

function VotePulse({ ballots }: { readonly ballots: number }) {
  const pulse = useLoop('pulse');
  const locale = useLocale();
  return (
    <Animated.View style={pulse}>
      <StatusChip status="vote" label={upper(voteWord(ballots), locale)} testID="day-chip-vote" />
    </Animated.View>
  );
}

export function DayChip({ chip }: { readonly chip: DayChipModel }) {
  const theme = useTheme();
  const locale = useLocale();
  if (chip === null) return null;
  if (chip.kind === 'booked') {
    return (
      <StatusChip
        status="booked"
        label={upper(t({ id: 'plan.overview.chip.booked', message: 'Booked' }), locale)}
        testID="day-chip-booked"
      />
    );
  }
  if (chip.kind === 'vote') return <VotePulse ballots={chip.ballots} />;
  return (
    <Icon
      name={chip.icon}
      size={theme.space['24']}
      color={theme.semantic.text.secondary}
      decorative
      testID={`day-chip-${chip.icon}`}
    />
  );
}
