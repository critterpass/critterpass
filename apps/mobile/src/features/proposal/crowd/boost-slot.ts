/**
 * Where BOOST on the crowd sheet (4f-1) goes: the trip Boost purchase, registered by the
 * monetisation area. Until it registers, the sheet explains the cap and offers no button.
 */
export type SeatBoost = (tripId: string) => void;

let boost: SeatBoost | null = null;

export function registerSeatBoost(next: SeatBoost): () => void {
  boost = next;
  return () => {
    if (boost === next) boost = null;
  };
}

export function seatBoost(): SeatBoost | null {
  return boost;
}
