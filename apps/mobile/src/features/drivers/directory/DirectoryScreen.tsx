/**
 * The directory screen (6e-1, 6e-3): fetches every listed driver, keeps the answer on the phone and
 * filters it here, so the chips still work offline from the last fetch.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, SQL and format options, never copy. */
import type { DriverDirectoryList } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { fetchDirectory, lastDirectory } from '../ours/api';
import { driverRoutes } from '../ours/routes';
import { DirectoryView } from './DirectoryView';
import {
  areaChips,
  filterDirectory,
  nearbyAreas,
  NO_FILTERS,
  type DirectoryFilters,
} from './filter';

// A wire value matched by prefix against the driver's own language names.
const ENGLISH = 'English';

export function DirectoryScreen({
  tripId,
  area,
}: {
  readonly tripId: string;
  /** The trip's own area, selected first. */
  readonly area: string | null;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  const cached = useMemo(() => lastDirectory(), []);
  const [list, setList] = useState<DriverDirectoryList | null>(cached?.list ?? null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(cached === null);
  const [filters, setFilters] = useState<DirectoryFilters>({
    ...NO_FILTERS,
    areas: area === null ? [] : [area],
  });

  useEffect(() => {
    let live = true;
    void fetchDirectory().then((outcome) => {
      if (!live) return;
      setLoading(false);
      if (outcome.kind === 'ok') {
        setList(outcome.value);
        setSavedAt(null);
      } else if (cached !== null) {
        setSavedAt(cached.fetchedAt);
      }
    });
    return () => {
      live = false;
    };
  }, [cached]);

  const drivers = list?.drivers ?? [];
  const shown = filterDirectory(drivers, filters);
  const chips = areaChips(drivers, area);
  const widenTo = shown.length === 0 ? (nearbyAreas(drivers, filters.areas)[0] ?? null) : null;
  const time =
    savedAt === null
      ? null
      : new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
          new Date(savedAt),
        );
  const toggle = (patch: Partial<DirectoryFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <DirectoryView
      drivers={shown}
      areaChips={chips}
      languageChip={ENGLISH}
      filters={filters}
      onToggleArea={(chip) =>
        toggle({
          areas: filters.areas.includes(chip)
            ? filters.areas.filter((a) => a !== chip)
            : [...filters.areas, chip],
        })
      }
      onToggleLanguage={() => toggle({ language: filters.language === null ? ENGLISH : null })}
      onToggleSevenPlus={() => toggle({ sevenPlus: !filters.sevenPlus })}
      onToggleDayTrips={() => toggle({ dayTrips: !filters.dayTrips })}
      widenTo={widenTo}
      onWiden={() => {
        if (widenTo !== null) toggle({ areas: [...filters.areas, widenTo] });
      }}
      staleLine={
        time === null
          ? null
          : t({ id: 'drivers.directory.stale', message: `Offline. The list from ${time}.` })
      }
      loading={loading}
      onBack={() => router.back()}
      onOpen={(id) => router.push(driverRoutes.detail(tripId, id))}
    />
  );
}
