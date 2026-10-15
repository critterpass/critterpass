/**
 * "Did you mean" for an airport typed by hand: a known three-letter code is taken as it is; a city,
 * an airport name or a mistyped code gets the best offline match (the bundled airports), so the
 * form can offer it in one tap. Nothing is suggested when nothing matches well.
 */
import { searchAirports, type AirportDataset } from '@cp/domain';

export interface AirportSuggestion {
  readonly iata: string;
  readonly name: string;
  readonly city: string;
}

type Dataset = Pick<AirportDataset, 'airports' | 'metros' | 'countries'>;

const CODE = /^[A-Z]{3}$/u;

export function airportSuggestion(typed: string, dataset: Dataset): AirportSuggestion | null {
  const text = typed.trim();
  if (text.length < 2) return null;
  const code = text.toUpperCase();
  if (CODE.test(code) && dataset.airports.some((airport) => airport.iata === code)) return null;
  // Airports only: a booking's leg lands at one airport, never a metro group.
  const hit = searchAirports(dataset, text, 5).find((one) => one.kind === 'airport');
  if (hit?.kind !== 'airport') return null;
  const { iata, name, city } = hit.airport;
  return { iata, name, city };
}

/** The city a known code serves ("SIN" → "Singapore"), shown under the code on its card. */
export function airportCity(typed: string, dataset: Dataset): string | null {
  const code = typed.trim().toUpperCase();
  if (!CODE.test(code)) return null;
  return dataset.airports.find((airport) => airport.iata === code)?.city ?? null;
}

/**
 * What is wrong with a typed airport, said on its card: one letter past a code ("DENP"), or, once
 * Save was tried, anything that is not a known code. A city or name typed out gets the "Did you
 * mean" instead, so it is not called wrong while it reads as one.
 */
export function airportProblem(
  typed: string,
  dataset: Dataset,
  tried: boolean,
): 'tooLong' | 'notCode' | null {
  const code = typed.trim().toUpperCase();
  if (code === '' && !tried) return null;
  if (CODE.test(code) && dataset.airports.some((airport) => airport.iata === code)) return null;
  if (/^[A-Z]{4}$/u.test(code)) return 'tooLong';
  return tried ? 'notCode' : null;
}
