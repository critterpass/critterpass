import type { DirectoryFilters } from './filter';
import type { DriverDirectoryCard } from '@cp/domain';

export interface DirectoryViewProps {
  readonly drivers: readonly DriverDirectoryCard[];
  readonly areaChips: readonly string[];
  readonly languageChip: string | null;
  readonly filters: DirectoryFilters;
  readonly onToggleArea: (area: string) => void;
  readonly onToggleLanguage: () => void;
  readonly onToggleSevenPlus: () => void;
  readonly onToggleDayTrips: () => void;
  /** The nearest listed area when the chosen area has nobody. */
  readonly widenTo: string | null;
  readonly onWiden: () => void;
  /** "Saved 06:12, offline" when the list is the last answer kept on the phone. */
  readonly staleLine: string | null;
  readonly loading: boolean;
  /** The first read failed and nothing is kept on the phone: why, for the retry state. */
  readonly failure?: 'offline' | 'error' | null | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly onBack: () => void;
  readonly onOpen: (id: string) => void;
}
