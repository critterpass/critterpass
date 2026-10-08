/**
 * The trip's open disruptions as hub rows, one each: a delayed or cancelled flight, a storm the
 * crew is voting on, someone running late, a closure or bad weather. The push that announced one
 * is gone once dismissed; the row keeps it one tap away until it is resolved.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, route paths and icon names, never copy. */
import { t } from '@lingui/core/macro';
import type { Href } from 'expo-router';

import type { DoodleName } from '@/ui/icons/generated';

export const OPEN_DISRUPTIONS_SQL = `SELECT id, kind, title, summary, decision_poll_id, i18n
  FROM disruptions WHERE trip_id = ? AND status = 'open' ORDER BY detected_at DESC LIMIT 6`;
export const OPEN_DISRUPTIONS_TABLES = ['disruptions'];

export interface OpenDisruptionRow {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly decision_poll_id: string | null;
  readonly i18n: string | null;
}

export function forecastHref(tripId: string): Href {
  return { pathname: '/(trip)/forecast/[tripId]', params: { tripId } };
}

/** The screen that handles one disruption: its own by kind, else the trip's forecast and watch list. */
export function disruptionHref(
  row: Pick<OpenDisruptionRow, 'id' | 'kind' | 'decision_poll_id'>,
  tripId: string,
): Href {
  if (row.kind === 'flight_delay') {
    return { pathname: '/(trip)/disruption/[id]', params: { id: row.id } };
  }
  if (row.kind === 'running_late') {
    return { pathname: '/(trip)/late/[id]', params: { id: row.id } };
  }
  if (row.kind === 'storm' && row.decision_poll_id !== null) {
    return { pathname: '/(trip)/storm/[pollId]', params: { pollId: row.decision_poll_id } };
  }
  return forecastHref(tripId);
}

export function disruptionIcon(kind: string): DoodleName {
  if (kind === 'flight_delay') return 'plane';
  if (kind === 'running_late') return 'bell';
  if (kind === 'closure') return 'lock';
  return 'rain';
}

/** The row's caps label: what kind of change it is. */
export function disruptionLabel(kind: string): string {
  switch (kind) {
    case 'flight_delay':
      return t({ id: 'trip.hub.disruption.flight', message: 'Flight change' });
    case 'running_late':
      return t({ id: 'trip.hub.disruption.late', message: 'Running late' });
    case 'storm':
      return t({ id: 'trip.hub.disruption.storm', message: 'Storm' });
    case 'closure':
      return t({ id: 'trip.hub.disruption.closure', message: 'Closed' });
    default:
      return t({ id: 'trip.hub.disruption.weather', message: 'Weather' });
  }
}
