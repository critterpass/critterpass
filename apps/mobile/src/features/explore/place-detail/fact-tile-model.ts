/**
 * The four fact tiles under a place's name (7e-1): OPEN that day, ENTRY, TAKES and WEAR. A tile
 * with nothing behind it is left out, never guessed: our own hours, and only approved editorial
 * facts.
 */
import { t } from '@lingui/core/macro';

import type { FactTiles } from './context';

export interface FactTile {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

const hours = (from: string, to: string): string => {
  const short = (time: string) => (time.endsWith(':00') ? time.slice(0, 2) : time);
  return `${short(from)}–${short(to)}`;
};

const takes = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m}M` : m === 0 ? `${h}H` : `${h}H${String(m).padStart(2, '0')}`;
};

export function factTileList(facts: FactTiles): FactTile[] {
  const open = facts.openSpans.map((span) => hours(span.from, span.to)).join(', ');
  const tiles = [
    facts.hoursKnown
      ? {
          key: 'open',
          label: t({ id: 'explore.detail.tile.open', message: 'Open' }),
          value: open === '' ? t({ id: 'explore.detail.tile.closed', message: 'Closed' }) : open,
        }
      : null,
    facts.entry === null
      ? null
      : {
          key: 'entry',
          label: t({ id: 'explore.detail.tile.entry', message: 'Entry' }),
          value: facts.entry,
        },
    facts.takesMin === null
      ? null
      : {
          key: 'takes',
          label: t({ id: 'explore.detail.tile.takes', message: 'Takes' }),
          value: takes(facts.takesMin),
        },
    facts.dress === null
      ? null
      : {
          key: 'wear',
          label: t({ id: 'explore.detail.tile.wear', message: 'Wear' }),
          value: facts.dress,
        },
  ].filter((tile): tile is FactTile => tile !== null);
  return tiles;
}
