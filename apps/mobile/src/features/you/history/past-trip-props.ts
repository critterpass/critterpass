import type { CountryOption } from './past-trip-form';

export interface PastTripViewProps {
  readonly editing: boolean;
  readonly query: string;
  readonly onQuery: (text: string) => void;
  readonly results: readonly CountryOption[];
  readonly onCountry: (option: CountryOption) => void;
  readonly years: readonly number[];
  readonly year: number | null;
  readonly onYear: (year: number) => void;
  readonly monthsOpen: ReadonlySet<number>;
  readonly month: number | null;
  readonly onMonth: (month: number) => void;
  readonly canSave: boolean;
  readonly onSave: () => void;
  readonly onRemove?: () => void;
  readonly onBack?: () => void;
}
