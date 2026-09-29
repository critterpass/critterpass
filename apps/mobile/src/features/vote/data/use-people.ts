/** The crew's people for avatars: display names and join order (the avatar colour). */
import { useMemo } from 'react';

import { useLiveRows } from './live-rows';
import { PEOPLE_SQL, PEOPLE_TABLES } from './poll-queries';

export interface Person {
  readonly id: string;
  readonly name: string;
  readonly joinIndex: number;
}

export function usePeople(crewId: string | null): ReadonlyMap<string, Person> {
  const { rows } = useLiveRows<{ id: string; display_name: string | null }>(
    PEOPLE_SQL,
    crewId === null ? null : [crewId],
    PEOPLE_TABLES,
  );
  return useMemo(
    () =>
      new Map(
        rows.map((row, index) => [
          row.id,
          { id: row.id, name: row.display_name ?? '', joinIndex: index },
        ]),
      ),
    [rows],
  );
}

/** Stack members for a list of voters (unknown people are left out). */
export function stackOf(
  people: ReadonlyMap<string, Person>,
  ids: readonly string[],
): { key: string; name: string; joinIndex: number }[] {
  return ids.flatMap((id) => {
    const person = people.get(id);
    return person === undefined
      ? []
      : [{ key: id, name: person.name, joinIndex: person.joinIndex }];
  });
}
