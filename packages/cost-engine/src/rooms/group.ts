/**
 * Who sleeps where (3c-6): a deterministic room proposal from each member's chronotype and room
 * chips. Couples share a room first; then light sleepers, early risers and night owls each fill
 * the roomiest room left, so like sleeps with like; snorers stay out of light sleepers' rooms when
 * any other bed is free; "don't care" is honoured literally and fills whatever is left. Each room
 * takes the label of the first group placed in it.
 */
import { DomainError } from '@cp/domain';

export type RoomChip = 'early_bird' | 'night_owl' | 'light_sleeper' | 'snorer' | 'dont_care';
export type RoomTraitLabel = 'light_sleepers' | 'early_risers' | 'night_owls' | 'couple';

export interface RoomGuest {
  readonly uid: string;
  /** Taste chronotype, used when the member set no sleep chip. */
  readonly chronotype?: 'early' | 'late' | null;
  readonly chips?: readonly RoomChip[];
  /** The member they share a bed with (either side may name the other). */
  readonly partnerId?: string | null;
}

export interface RoomSpace {
  readonly key: string;
  readonly capacity: number;
}

export interface ProposedRoom {
  readonly key: string;
  readonly capacity: number;
  readonly occupants: readonly string[];
  readonly label: RoomTraitLabel | null;
}

type Trait = 'light_sleepers' | 'early_risers' | 'night_owls' | 'snorers' | null;
const TRAIT_ORDER: readonly Trait[] = ['light_sleepers', 'early_risers', 'night_owls', 'snorers'];

function traitOf(guest: RoomGuest): Trait {
  const chips = new Set(guest.chips ?? []);
  if (chips.has('dont_care')) return null;
  if (chips.has('light_sleeper')) return 'light_sleepers';
  if (chips.has('early_bird')) return 'early_risers';
  if (chips.has('night_owl')) return 'night_owls';
  if (chips.has('snorer')) return 'snorers';
  if (guest.chronotype === 'early') return 'early_risers';
  if (guest.chronotype === 'late') return 'night_owls';
  return null;
}

interface MutableRoom {
  readonly key: string;
  readonly capacity: number;
  occupants: string[];
  label: RoomTraitLabel | null;
  traits: Set<Trait>;
}

const free = (room: MutableRoom) => room.capacity - room.occupants.length;

/** The room with the most free beds (then key order) that fits `size`, honouring `avoid`. */
function roomiest(
  rooms: readonly MutableRoom[],
  size: number,
  avoid: Trait | null,
): MutableRoom | undefined {
  const fits = rooms.filter((room) => free(room) >= size);
  const preferred = avoid === null ? fits : fits.filter((room) => !room.traits.has(avoid));
  return [...(preferred.length > 0 ? preferred : fits)].sort(
    (a, b) => free(b) - free(a) || (a.key < b.key ? -1 : 1),
  )[0];
}

export function groupRooms(
  guests: readonly RoomGuest[],
  spaces: readonly RoomSpace[],
): ProposedRoom[] {
  const capacity = spaces.reduce((sum, space) => sum + space.capacity, 0);
  if (guests.length > capacity) {
    throw new DomainError('STATE_INVALID', {
      reason: 'rooms_too_small',
      guests: guests.length,
      capacity,
    });
  }
  const rooms: MutableRoom[] = [...spaces]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((space) => ({ ...space, occupants: [], label: null, traits: new Set<Trait>() }));
  const byUid = new Map(guests.map((guest) => [guest.uid, guest]));
  const placed = new Set<string>();
  const put = (
    room: MutableRoom,
    uids: readonly string[],
    trait: Trait,
    label: RoomTraitLabel | null,
  ) => {
    room.occupants.push(...uids);
    room.traits.add(trait);
    room.label ??= label;
    uids.forEach((uid) => placed.add(uid));
  };

  const ordered = [...guests].sort((a, b) => (a.uid < b.uid ? -1 : 1));
  for (const guest of ordered) {
    const partner = guest.partnerId ? byUid.get(guest.partnerId) : undefined;
    if (!partner || placed.has(guest.uid) || placed.has(partner.uid)) continue;
    const room = roomiest(rooms, 2, null);
    if (room === undefined)
      throw new DomainError('STATE_INVALID', { reason: 'no_room_for_couple' });
    put(room, [guest.uid, partner.uid].sort(), traitOf(guest), 'couple');
  }

  for (const trait of [...TRAIT_ORDER, null]) {
    const group = ordered.filter((guest) => !placed.has(guest.uid) && traitOf(guest) === trait);
    const avoid =
      trait === 'snorers' ? 'light_sleepers' : trait === 'light_sleepers' ? 'snorers' : null;
    const label = trait === 'snorers' || trait === null ? null : trait;
    for (const guest of group) {
      const current = rooms.find(
        (room) => room.traits.has(trait) && trait !== null && free(room) > 0,
      );
      const room = current ?? roomiest(rooms, 1, avoid);
      if (room === undefined) {
        throw new DomainError('STATE_INVALID', {
          reason: 'rooms_too_small',
          guests: guests.length,
          capacity,
        });
      }
      put(room, [guest.uid], trait, label);
    }
  }
  return rooms.map(({ key, capacity: beds, occupants, label }) => ({
    key,
    capacity: beds,
    occupants,
    label,
  }));
}
