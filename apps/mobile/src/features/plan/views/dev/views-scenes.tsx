/**
 * Lab scenes for the plan's MAP and CALENDAR tabs (and their offline and open-dates states) over
 * the Bali week, with every handler a no-op.
 */

import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import { PillButton } from '@/ui/buttons/PillButton';

import { BALI_DAYS, BALI_ITEMS } from '../../overview/dev/bali-plan';
import { overviewProps } from '../../overview/dev/overview-scenes';
import { PlanOverviewView } from '../../overview/plan-overview-view';
import { calendarMonths } from '../model/views-model';
import { PlanCalendar } from '../plan-calendar';
import { ExportSheetView, type ExportStatus } from '../export-sheet';
import { PlanMap } from '../plan-map';

const noop = () => undefined;

function mapView(offline: boolean): ReactNode {
  return (
    <PlanMap
      days={BALI_DAYS}
      items={BALI_ITEMS}
      destinationSlug="bali"
      localRegionUri={null}
      offlineUnavailable={offline}
      onDownload={offline ? null : noop}
      onOpenItem={noop}
    />
  );
}

function calendarView(dated: boolean): ReactNode {
  const days = dated ? BALI_DAYS : BALI_DAYS.map((day) => ({ ...day, date: null }));
  return (
    <PlanCalendar
      months={calendarMonths(days, BALI_ITEMS, null)}
      onOpenDay={noop}
      actions={
        dated ? (
          <PillButton
            label={t({ id: 'plan.calendar.export', message: 'Put it in my calendar' })}
            variant="secondary"
            block
            onPress={noop}
          />
        ) : null
      }
    />
  );
}

function scene(tab: 'map' | 'calendar', view: () => ReactNode, offline = false): () => ReactNode {
  return function Scene() {
    return (
      <PlanOverviewView
        {...overviewProps({
          tab,
          mapView: tab === 'map' ? view() : mapView(false),
          calendarView: tab === 'calendar' ? view() : calendarView(true),
          offline: offline ? { lastSyncedAt: new Date(Date.now() - 42 * 60 * 1000) } : null,
        })}
      />
    );
  };
}

function exportScene(canWrite: boolean, status: ExportStatus): () => ReactNode {
  return function Scene() {
    return (
      <>
        {scene('calendar', () => calendarView(true))()}
        <ExportSheetView
          canWrite={canWrite}
          eventCount={11}
          status={status}
          written={11}
          onWrite={noop}
          onSubscribe={noop}
          onCopy={noop}
          onRevoke={noop}
          onClose={noop}
        />
      </>
    );
  };
}

export const VIEWS_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'views-map': scene('map', () => mapView(false)),
  'views-map-offline': scene('map', () => mapView(true), true),
  'views-calendar': scene('calendar', () => calendarView(true)),
  'views-calendar-no-dates': scene('calendar', () => calendarView(false)),
  'export-subscribe': exportScene(false, 'idle'),
  'export-write': exportScene(true, 'idle'),
  'export-written': exportScene(true, 'written'),
  'export-denied': exportScene(true, 'denied'),
  'export-revoked': exportScene(false, 'revoked'),
};
