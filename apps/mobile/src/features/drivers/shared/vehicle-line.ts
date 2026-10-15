import type { DriverDirectoryCard } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

/** `Toyota HiAce, 10 seats`, `10 seats`, `Toyota HiAce`, or nothing. */
export function useVehicleLine(
  driver: Pick<DriverDirectoryCard, 'vehicle' | 'seats'>,
): string | null {
  const { t } = useLingui();
  const seats = driver.seats ?? driver.vehicle?.seats ?? null;
  const model = driver.vehicle?.model ?? null;
  if (seats === null) return model;
  if (model === null) return t({ id: 'drivers.card.seats', message: `${seats} seats` });
  return t({ id: 'drivers.card.car', message: `${model}, ${seats} seats` });
}
