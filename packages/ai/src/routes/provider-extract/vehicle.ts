/**
 * The car line of a driver card: a model or kind of vehicle, and how many it carries. A number of
 * seats is kept only when the quoted words hold it, so the size of the group that posted the
 * message ("for 6 of us") is never read as the size of the car.
 */
import { amountTokens } from './money-text';

/** "Car" says nothing a traveller could check: only a model or a kind of vehicle is a car line. */
const NO_VEHICLE =
  /^(?:(?:a|private|the)\s+)?(?:car|cars|vehicle|auto|mobil|coche|carro|voiture|xe)(?:\s+(?:charter|hire|rental|with driver))?$/iu;

const CAPACITY = [
  /(?:up to|max\.?|maximum|hasta|até|sampai|tối đa)\s*(\d{1,2})(?!\d)/iu,
  /(?<![\d.,])(\d{1,2})\s*-?\s*(?:pax|seats?|seaters?|passengers?|ppl|people|persons?|guests|org|orang|penumpang|pasajeros|personas|pessoas|lugares|chỗ|人乗り|名)/iu,
];

/** The vehicle as written, or null when the words name no particular one. */
export function vehicleOf(value: string | null): string | null {
  const model = value?.trim() ?? '';
  return model === '' || NO_VEHICLE.test(model) ? null : model.slice(0, 80);
}

const inRange = (seats: number | null): seats is number =>
  seats !== null && Number.isInteger(seats) && seats >= 1 && seats <= 60;

/**
 * The seats the model answered, when the quoted words hold that figure. A vehicle that carries one
 * passenger (a motorbike with its rider) has no figure to write.
 */
export function seatsIn(seats: number | null, quote: string): number | null {
  if (!inRange(seats)) return null;
  if (seats === 1) return 1;
  return amountTokens(quote).some((token) => token.min === seats || token.max === seats)
    ? seats
    : null;
}

/** The seats the words state as what a vehicle carries ("up to 4", "7 seats", "6 pax"). */
export function capacityIn(quote: string): number | null {
  for (const pattern of CAPACITY) {
    const seats = Number(pattern.exec(quote)?.[1] ?? Number.NaN);
    if (inRange(seats)) return seats;
  }
  return null;
}
