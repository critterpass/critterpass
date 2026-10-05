/**
 * The places list's order (7c-3 "SORTED BY FIT FOR YOUR DAYS ▾" and the count): tapping it opens
 * the choices inline (fit, nearest, A–Z) and, at the foot, the places I hid, each with a way to
 * show it again. The line names the order the list is really in (the guide's picks while no fit
 * order is known) and the count is the shown filter's. The menu itself is undesigned
 * (docs/undesigned-states.md).
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { SortMode } from './place-groups';
import { showAgainLabel } from './places-copy';

export interface HiddenEntry {
  readonly poiId: string;
  readonly name: string;
}

export interface SortMenuProps {
  readonly sort: SortMode;
  readonly onSort: (sort: SortMode) => void;
  /** Each choice's words, as the list would run under it now. */
  readonly labels: Readonly<Record<SortMode, string>>;
  /** A line under the bar (how to save by swiping), until it is no longer needed. */
  readonly hint?: string | undefined;
  readonly count: number;
  /** Inside a trip "fit" orders by the trip's days; outside one it isn't offered. */
  readonly inTrip: boolean;
  readonly hidden: readonly HiddenEntry[];
  readonly onUnhide: (poiId: string) => void;
}

const useStyles = makeStyles((t) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.size.gutter,
    paddingVertical: t.space['8'],
    gap: t.space['12'],
  },
  label: { flexShrink: 1, justifyContent: 'center' },
  hint: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['8'] },
  menu: {
    marginHorizontal: t.size.gutter,
    marginBottom: t.space['8'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    paddingVertical: t.space['4'],
  },
  option: { paddingHorizontal: t.space['16'], paddingVertical: t.space['12'] },
  hiddenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space['16'],
    paddingVertical: t.space['10'],
  },
  rule: { height: 1, marginVertical: t.space['4'], backgroundColor: t.semantic.bg.control },
}));

export function SortMenu(props: SortMenuProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const [open, setOpen] = useState(false);
  const { labels } = props;
  const modes: readonly SortMode[] = props.inTrip ? ['fit', 'nearest', 'az'] : ['nearest', 'az'];
  return (
    <View>
      <View style={styles.bar}>
        <PressScale
          widthClass="narrow"
          accessibilityRole="button"
          accessibilityLabel={labels[props.sort]}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((now) => !now)}
          style={styles.label}
          testID="places-sort"
        >
          <Text
            variant="eyebrow"
            numberOfLines={1}
            testID="places-sort-label"
          >{`${upper(labels[props.sort], i18n.locale)} ▾`}</Text>
        </PressScale>
        <Text variant="eyebrow" color={theme.semantic.text.secondary} testID="places-list-count">
          {String(props.count)}
        </Text>
      </View>
      {props.hint === undefined || open ? null : (
        <View style={styles.hint}>
          <Text variant="bodySm" color={theme.semantic.text.secondary} testID="places-swipe-hint">
            {props.hint}
          </Text>
        </View>
      )}
      {open ? (
        <View style={styles.menu} testID="places-sort-menu">
          {modes.map((mode) => (
            <PressScale
              key={mode}
              style={styles.option}
              accessibilityRole="button"
              accessibilityLabel={labels[mode]}
              accessibilityState={{ selected: mode === props.sort }}
              onPress={() => {
                props.onSort(mode);
                setOpen(false);
              }}
              testID={`places-sort-${mode}`}
            >
              <Text
                variant="body"
                color={mode === props.sort ? theme.semantic.action.primary : undefined}
              >
                {labels[mode]}
              </Text>
            </PressScale>
          ))}
          <View style={styles.rule} />
          <View style={styles.option}>
            <Text variant="eyebrow" color={theme.semantic.text.secondary}>
              {upper(t({ id: 'places.hidden.title', message: 'Hidden places' }), i18n.locale)}
            </Text>
          </View>
          {props.hidden.length === 0 ? (
            <View style={styles.option}>
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {t({ id: 'places.hidden.none', message: "You haven't hidden any places." })}
              </Text>
            </View>
          ) : (
            props.hidden.map((entry) => (
              <View key={entry.poiId} style={styles.hiddenRow}>
                <Text variant="body" numberOfLines={1}>
                  {entry.name}
                </Text>
                <PressScale
                  widthClass="narrow"
                  accessibilityRole="button"
                  accessibilityLabel={showAgainLabel(entry.name)}
                  onPress={() => props.onUnhide(entry.poiId)}
                  testID={`places-unhide-${entry.poiId}`}
                >
                  <Text variant="label" color={theme.semantic.action.primary}>
                    {upper(t({ id: 'places.hidden.show', message: 'Show' }), i18n.locale)}
                  </Text>
                </PressScale>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
