/**
 * The four fact tiles under a place's name (7e-1): OPEN that day, ENTRY, TAKES and WEAR. A tile
 * with nothing behind it is left out, never guessed: our own hours, and only approved editorial
 * facts.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { FactTiles } from './context';

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: t.space['8'] },
  tile: {
    flex: 1,
    minWidth: 0,
    gap: t.space['2'],
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['8'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.raised,
  },
}));

const hours = (from: string, to: string): string => {
  const short = (time: string) => (time.endsWith(':00') ? time.slice(0, 2) : time);
  return `${short(from)}–${short(to)}`;
};

const takes = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m}M` : m === 0 ? `${h}H` : `${h}H${String(m).padStart(2, '0')}`;
};

export function FactTileRow({ facts }: { readonly facts: FactTiles }) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
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
  ].filter((tile): tile is { key: string; label: string; value: string } => tile !== null);
  if (tiles.length === 0) return null;
  return (
    <View style={styles.row} testID="place-detail-facts">
      {tiles.map((tile) => (
        <View
          key={tile.key}
          style={styles.tile}
          accessible
          accessibilityLabel={`${tile.label}: ${tile.value}`}
          testID={`place-detail-fact-${tile.key}`}
        >
          <Text variant="label" color={theme.semantic.text.secondary}>
            {upper(tile.label, i18n.locale)}
          </Text>
          <Text variant="title">{upper(tile.value, i18n.locale)}</Text>
        </View>
      ))}
    </View>
  );
}
