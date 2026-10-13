/**
 * The hub's tiles (3k-1): PLAN, BOOKINGS and MONEY from this area, plus tiles other areas register
 * (QUESTS, PHOTOS). The hub draws every tile in its own look (`HubTileLook`), so registered tiles
 * wear the same tile as the built-in doors.
 */
import type { ReactNode } from 'react';
import { createContext, useContext, useSyncExternalStore } from 'react';

import type { CardTone } from '@/ui/premium/cards/card-tone';
import type { DoodleName } from '@/ui/premium/icons/doodles/generated';

export interface HubTileData {
  readonly key: string;
  readonly title: string;
  readonly value: string;
  readonly caption: string | null;
  readonly icon: DoodleName;
  readonly tone: CardTone;
  readonly onPress?: () => void;
}

/** How the hub draws a tile: the premium hub provides a function returning its own tile element. */
export const HubTileLook = createContext<((tile: HubTileData) => ReactNode) | null>(null);

/** A registered tile's content, drawn in the hub's look; nothing outside a hub. */
export function HubTile({ tile }: { readonly tile: HubTileData }) {
  const look = useContext(HubTileLook);
  return look === null ? null : look(tile);
}

/** What a registered tile renders with. */
export interface HubTileProps {
  readonly tripId: string;
  readonly crewId: string;
}

interface Registered {
  readonly key: string;
  readonly order: number;
  readonly Tile: (props: HubTileProps) => ReactNode;
}

let registered: readonly Registered[] = [];
const listeners = new Set<() => void>();

/**
 * Another area adds a hub tile (QUESTS registers from the quests area). `order` places it after
 * PLAN (10), BOOKINGS (20) and MONEY (30). Returns the unregister function.
 */
export function registerHubTile(entry: Registered): () => void {
  registered = [...registered.filter((tile) => tile.key !== entry.key), entry].sort(
    (a, b) => a.order - b.order,
  );
  listeners.forEach((listener) => listener());
  return () => {
    registered = registered.filter((tile) => tile !== entry);
    listeners.forEach((listener) => listener());
  };
}

export function useRegisteredHubTiles(): readonly Registered[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => registered,
  );
}
