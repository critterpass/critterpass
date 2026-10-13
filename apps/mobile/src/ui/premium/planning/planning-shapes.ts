/**
 * The shapes the planning screens hand their pieces: the day chips, a place's fit, the hour bars,
 * the reasons a time was picked, a day's route and its places on the map, the crew faces of a
 * stack, and the small route sketch's layout. View models build them; premium views draw them.
 */
import type { ReactNode } from 'react';
import type { ImageSourcePropType } from 'react-native';

import type { DoodleName } from '../icons/doodles/generated';

/** How well a place fits a day: a dot on the day's chip. */
export type FitGrade = 'good' | 'possible' | 'no';
/** The line under a place: fits, fits if something moves, the crew is split, doesn't fit. */
export type FitTone = 'fits' | 'needsMove' | 'split' | 'none';

export interface DayChip {
  readonly dayNo: number;
  /** Short weekday, already localised ("Wed"). */
  readonly weekday: string;
  /** The day of the month ("17"): with it the chip reads weekday over date. */
  readonly dateLabel?: string | undefined;
  /** Today on the trip's clock. */
  readonly today?: boolean | undefined;
  readonly color: string;
  readonly fit?: FitGrade | undefined;
  /** The day is spent away from the trip's city (a day trip). */
  readonly mark?: boolean | undefined;
  /** The day cannot take what is being placed: dimmed, still tappable to say why. */
  readonly dimmed?: boolean | undefined;
  /** Screen-reader words for the day, e.g. "Wednesday 14 October". */
  readonly accessibilityLabel: string;
}

/** A chip across the top of a planning map or list. */
export interface PlanningChip {
  readonly key: string;
  readonly label: string;
  readonly count?: number | undefined;
  readonly selected?: boolean | undefined;
  /** The fill when chosen; paper when absent. */
  readonly color?: string | undefined;
  /** Can be taken off with × (search filters). */
  readonly removable?: boolean | undefined;
}

/** Why a time was picked: one tile with its doodle. */
export interface Reason {
  readonly key: string;
  readonly icon: DoodleName;
  readonly text: string;
}

/** How busy a place gets in one hour. */
export interface HourLevel {
  /** Local hour, 0–23. */
  readonly hour: number;
  /** 0 (empty) to 1 (packed). */
  readonly level: number;
}

/** Steps on a pace bar (calm to packed). */
export const PACE_STEPS = 5;

/** A crew face in a stack. */
export interface StackMember {
  readonly key: string;
  readonly name: string;
  /** The member's user id: the stack draws the face they chose. */
  readonly uid?: string | null | undefined;
  readonly joinIndex: number;
  readonly photo?: ImageSourcePropType;
  /** A sticker worn as the member's avatar (a guide), drawn inside the circle. */
  readonly critter?: ReactNode;
  readonly pending?: boolean;
}

export type Coord = readonly [number, number];

export interface RouteStop {
  readonly id: string;
  /** The number on the stop: its order in the day. */
  readonly n: number;
  readonly lat: number;
  readonly lng: number;
  /** The stop's key in its legs (the plan item's stable id) when it is not `id`. */
  readonly legKey?: string;
}

/** A day's route on the map: numbered stops in the day's colour, along the road where known. */
export interface RouteDay {
  readonly dayNo: number;
  readonly color: string;
  readonly stops: readonly RouteStop[];
  /** Road paths of the day's legs, `[lng, lat]`, keyed `from>to` (`stay` or a stop's leg key). */
  readonly legPaths?: ReadonlyMap<string, readonly Coord[]>;
}

/** A place on a planning map. */
export interface PlaceDot {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly tier: 'saved' | 'suggested';
  /** The style sprite for the category, drawn on saved places. */
  readonly iconKey: string;
  /** How much the crew cares: 0 nobody yet, up to 3. */
  readonly relevance: number;
  /** The badge colour of whoever saved it. */
  readonly badgeColor?: string | undefined;
  /** Outside the active filter: drawn faded. */
  readonly dimmed?: boolean | undefined;
}

export interface SketchPoint {
  readonly lat: number;
  readonly lng: number;
}

/** A dot's size on the route sketch; the layout keeps a dot's width clear of the box's edge. */
const SKETCH_DOT = 10;

/** Points fitted into the box (inset by a dot), north up; one point sits in the middle. */
export function sketchLayout(
  points: readonly SketchPoint[],
  width: number,
  height: number,
): { readonly x: number; readonly y: number }[] {
  if (points.length === 0) return [];
  const lngs = points.map((point) => point.lng);
  const lats = points.map((point) => point.lat);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const spanX = east - west;
  const spanY = north - south;
  const innerW = width - SKETCH_DOT * 2;
  const innerH = height - SKETCH_DOT * 2;
  const scale = Math.min(
    spanX === 0 ? Infinity : innerW / spanX,
    spanY === 0 ? Infinity : innerH / spanY,
  );
  const k = Number.isFinite(scale) ? scale : 0;
  const offsetX = (width - spanX * k) / 2;
  const offsetY = (height - spanY * k) / 2;
  return points.map((point) => ({
    x: offsetX + (point.lng - west) * k,
    y: offsetY + (north - point.lat) * k,
  }));
}
