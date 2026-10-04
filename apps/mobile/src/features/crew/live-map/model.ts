/**
 * Everything the crew live map view draws and every action it offers, so the view renders the
 * same from the live controller (`use-live-map-screen.ts`) and from a fixed scene.
 */
import type { MeetupWire } from '@cp/domain';

import type { MeetupChoice } from './panel/meetup-editor';
import type { RowModel } from './panel/member-row';
import type { LiveGate } from './data/use-live-fixes';
import type { MeetupSnapshot } from './data/use-meetup-snapshot';
import type { VisibleTrail } from './data/use-trails';
import type { LiveView, PersonView } from './data/view-model';
import type { OwnFix } from './data/services';

export type Overlay =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'editor';
      readonly mode: 'create' | 'move';
      readonly dropped: { readonly lat: number; readonly lng: number } | null;
    }
  | { readonly kind: 'person'; readonly people: readonly PersonView[] };

export interface LiveMapModel {
  readonly tripId: string;
  readonly me: string | null;
  readonly crewName: string;
  readonly destinationId: string | null;
  readonly destinationSlug: string | null;
  readonly destinationName: string | null;
  readonly gate: LiveGate;
  readonly offline: boolean;
  /** Epoch ms of the last snapshot or publication. */
  readonly updatedAt: number | null;
  readonly view: LiveView | null;
  readonly rows: readonly RowModel[];
  readonly trails: readonly VisibleTrail[];
  readonly meetup: MeetupWire | null;
  readonly meetupTime: string | null;
  readonly meetupPending: boolean;
  readonly snapshot: MeetupSnapshot | null;
  readonly ownFix: OwnFix | null;
  readonly tz: string | null;
  readonly locale: string;
  readonly now: number;
  /** "Oct 19": the last trip day, when sharing switches itself off at midnight. */
  readonly endsOn: string | null;
  readonly windowStartsAt: Date | null;
  readonly windowEnded: boolean;
  readonly locationOff: boolean;
  readonly whileInUse: boolean;
  readonly lowPower: boolean;
  readonly overlay: Overlay;
  readonly pinging: boolean;
  readonly setOverlay: (overlay: Overlay) => void;
  readonly turnOn: () => void;
  readonly togglePause: () => void;
  readonly confirmMeetup: (mode: 'create' | 'move', choice: MeetupChoice) => void;
  readonly ping: (kind: 'ping' | 'on_my_way') => void;
  readonly openSettings: () => void;
  readonly offerAlways: () => void;
  readonly dragTick: () => void;
}
