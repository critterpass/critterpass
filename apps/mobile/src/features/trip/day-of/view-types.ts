import type { LeaveByView } from '../leave-by/model';
import type { DayLead } from './day-of-data';
import type { PackChip } from './packing-model';
import type { MediaAsset } from '@cp/domain';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';

export interface AlarmNote {
  readonly text: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
}

export interface DayOfViewProps {
  readonly state: 'loading' | 'ready';
  /** Where back lands when the day was opened cold (a link, a restored launch): the trip's hub. */
  readonly backFallback?: Href | undefined;
  readonly eyebrow: string;
  readonly forecast: string | null;
  /** Opens the trip's forecast and watch list from the forecast line. */
  readonly onForecast?: (() => void) | undefined;
  /** Opens the trip's offline page: what is saved on this phone and what is waiting to send. */
  readonly onOffline?: (() => void) | undefined;
  readonly leaveBy: LeaveByView | null;
  readonly now: Date;
  readonly guideName: string;
  /**
   * What leads the day when there is no leave-by: its first stop ("First up 09:30 · Hot
   * springs"), today's next stop, or that today is done. Null on a free day.
   */
  readonly firstUp: DayLead | null;
  /** Another day is shown while the trip is on: the way back to today. */
  readonly onToday?: (() => void) | undefined;
  readonly pack: readonly PackChip[];
  readonly timeline: readonly DayTimelineEntry[];
  readonly offline: boolean;
  readonly alarmNote: AlarmNote | null;
  readonly onImUp: () => void;
  /** Today is shown and the trip has a tomorrow: its page (its leave-by, its alarm). */
  readonly onTomorrow?: (() => void) | undefined;
  /** Opens the day plan for the day shown (legs, the map, adding and moving stops). */
  readonly onDayPlan?: (() => void) | undefined;
  /** GO to the next stop: the route from here, then directions in the maps app. */
  readonly onGo?: (() => void) | undefined;
  /** Where GO goes when the screen names no place for it (a flight's airport). */
  readonly goDetail?: string | null | undefined;
  /** "Running late?" with its minutes, for today's next stop (the screen's own control). */
  readonly late?: ReactNode;
  readonly onTogglePack: (id: string, packed: boolean) => void;
  readonly onAddPack: (label: string) => void;
  readonly onRemovePack: (id: string) => void;
  /** Overlays the ringing in-app alarm. */
  readonly overlay?: ReactNode;
  /** A photo of the destination under the quiet hero; null keeps the flat pink. */
  readonly heroMedia?: MediaAsset | null;
  readonly mediaLowData?: boolean;
}

export interface DayTimelineEntry {
  readonly id: string;
  readonly time: string;
  readonly title: string;
  readonly detail: string | null;
  /** Not mine: someone else's subgroup, or a stop I skip. */
  readonly dimmed: boolean;
  readonly onPress?: () => void;
  /** "1h30": how long the stop takes. */
  readonly length?: string | null | undefined;
  /** "Car · 20 min": the travel to the next stop. */
  readonly legAfter?: string | null | undefined;
  /** Today only: over, on now, or next. */
  readonly moment?: 'done' | 'now' | 'next' | null | undefined;
}
