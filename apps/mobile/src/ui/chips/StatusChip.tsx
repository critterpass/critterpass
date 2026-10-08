import { t } from '@lingui/core/macro';

import type { TagTone } from './Tag';
import { Tag } from './Tag';

export type ChipStatus =
  | 'booked'
  | 'vote'
  | 'in'
  | 'maybe'
  | 'unopened'
  | 'planned'
  | 'building'
  | 'ended'
  | 'live'
  | 'free'
  | 'boost'
  | 'passPlus';

export interface StatusChipProps {
  readonly status: ChipStatus;
  /** Overrides the default word ("Vote · 2 left"). */
  readonly label?: string;
  readonly testID?: string;
}

export function statusWord(status: ChipStatus): string {
  switch (status) {
    case 'booked':
      return t({ id: 'common.status.booked', message: 'Booked' });
    case 'vote':
      return t({ id: 'common.status.vote', message: 'Vote' });
    case 'in':
      return t({ id: 'common.status.in', message: 'In' });
    case 'maybe':
      return t({ id: 'common.status.maybe', message: 'Maybe' });
    case 'unopened':
      return t({ id: 'common.status.unopened', message: 'Unopened' });
    case 'planned':
      return t({ id: 'common.status.planned', message: 'Planned' });
    case 'building':
      return t({ id: 'common.status.building', message: 'Building' });
    case 'ended':
      return t({ id: 'common.status.ended', message: 'Ended' });
    case 'live':
      return t({ id: 'common.status.live', message: 'Live' });
    case 'free':
      return t({ id: 'common.status.free', message: 'Free' });
    case 'boost':
      return t({ id: 'common.status.boost', message: 'Boost' });
    case 'passPlus':
      return t({ id: 'common.status.passPlus', message: 'Pass+' });
  }
}

function toneFor(status: ChipStatus): TagTone {
  switch (status) {
    case 'booked':
    case 'in':
      return 'success';
    case 'vote':
    case 'live':
      return 'urgent';
    case 'boost':
      return 'boost';
    case 'maybe':
      return 'warning';
    case 'planned':
      return 'info';
    case 'building':
      return 'primary';
    case 'passPlus':
      return 'passPlus';
    case 'unopened':
    case 'ended':
    case 'free':
      return 'neutral';
  }
}

/** A word status tag (never colour alone): Booked, Vote, In, Maybe, Planned, Pass+, … */
export function StatusChip({ status, label, testID }: StatusChipProps) {
  return (
    <Tag label={label ?? statusWord(status)} tone={toneFor(status)} size="sm" testID={testID} />
  );
}
