/**
 * The crew's pins on the canvas: one per person or bunch, with its label placed so it stays inside
 * the screen (flipped leftwards or shifted in near an edge) and never draws over the meet-up or
 * another label (lifted, or dropped below when the header is in the way).
 */
import { pinLabel, statusLine } from '../copy';
import type { LiveMapModel } from '../model';
import { BunchPill } from './bunch-pill';
import {
  declutter,
  fitProjection,
  placeHorizontally,
  type HorizontalPlacement,
  type LabelBox,
} from './label-layout';
import type { CanvasPin } from './live-map-canvas';
import { MemberPin } from './member-pin';

export type PinLayout = ReadonlyMap<string, { offset: [number, number]; flip: boolean }>;

export function canvasPins(m: LiveMapModel, layout: PinLayout = new Map()): CanvasPin[] {
  if (m.view === null || m.gate !== 'open') return [];
  return m.view.pins.map((pin) => {
    const people = pin.kind === 'single' ? [pin.person] : pin.people;
    const lead = people[0];
    const at = lead?.position?.at ?? 0;
    const target =
      pin.kind === 'single'
        ? { lat: pin.person.position?.lat ?? 0, lng: pin.person.position?.lng ?? 0, at }
        : { lat: pin.lat, lng: pin.lng, at };
    const label = pinLabel(people, m.locale);
    const open = () => m.setOverlay({ kind: 'person', people });
    const key = people.map((person) => person.uid).join('+');
    const placed = layout.get(key);
    const flip = placed?.flip ?? false;
    return {
      key,
      target,
      offset: placed?.offset,
      flip,
      node:
        pin.kind === 'single' ? (
          <MemberPin
            person={pin.person}
            status={statusLine(pin.person, m.tz, m.locale, m.now)}
            label={label}
            onPress={open}
            flip={flip}
          />
        ) : (
          <BunchPill
            people={pin.people}
            place={lead?.eta?.status.poi ?? null}
            label={label}
            onPress={open}
            flip={flip}
          />
        ),
    };
  });
}

/** Widest pin label, points (the capsule's max width): layout keeps it on screen. */
const PIN_WIDTH = 220;
/** The meet-up pin with the guide beside it. */
const MEETUP_WIDTH = 280;
/** Layout key of the meet-up pin. */

export const MEETUP_KEY = 'meetup';
/** Labels stay this far inside the screen's left and right edges. */
const EDGE_INSET = 12;
const PIN_HEIGHT = 54;

/**
 * Where each pin label goes: flipped leftwards (or shifted in) so it stays inside the screen, and
 * lifted (or dropped) so it never draws over the meet-up or another label, north first.
 */
export function layoutPins(
  pins: readonly CanvasPin[],
  m: LiveMapModel,
  framed: readonly (readonly [number, number])[],
  view: Parameters<typeof fitProjection>[1],
): PinLayout {
  if (framed.length === 0) return new Map();
  const project =
    framed.length < 2
      ? () => [view.width / 2, view.padding.top] as [number, number]
      : fitProjection(framed, view);
  const boxes: LabelBox[] = [];
  const horizontal = new Map<string, HorizontalPlacement>();
  if (m.meetup !== null) {
    const [px] = project(m.meetup.lng, m.meetup.lat);
    const placed = placeHorizontally(px, MEETUP_WIDTH, view.width, EDGE_INSET);
    horizontal.set(MEETUP_KEY, placed);
    boxes.push({
      key: MEETUP_KEY,
      lng: m.meetup.lng,
      lat: m.meetup.lat,
      left: (placed.flip ? -MEETUP_WIDTH : 0) + placed.dx,
      width: MEETUP_WIDTH,
      height: 64,
    });
  }
  for (const pin of [...pins].sort((a, b) => b.target.lat - a.target.lat)) {
    const [px] = project(pin.target.lng, pin.target.lat);
    const placed = placeHorizontally(px, PIN_WIDTH, view.width, EDGE_INSET);
    horizontal.set(pin.key, placed);
    boxes.push({
      key: pin.key,
      lng: pin.target.lng,
      lat: pin.target.lat,
      left: (placed.flip ? -PIN_WIDTH : 0) + placed.dx,
      width: PIN_WIDTH,
      height: PIN_HEIGHT,
    });
  }
  const lifts = declutter(boxes, project, view.padding.top - 20);
  const layout = new Map<string, { offset: [number, number]; flip: boolean }>();
  for (const [key, placed] of horizontal) {
    // The meet-up is placed first and never lifted; it only flips or shifts in.
    const dy = key === MEETUP_KEY ? 0 : (lifts.get(key)?.[1] ?? 0);
    layout.set(key, { offset: [placed.dx, dy], flip: placed.flip });
  }
  return layout;
}
