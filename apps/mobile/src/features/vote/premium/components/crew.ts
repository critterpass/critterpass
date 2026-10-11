/**
 * Crew faces for the premium kit's `CrewStack`: each person keeps the colour of their join order,
 * the same one every other surface gives them.
 */
import { resolveMemberStyle } from '@cp/design-tokens';

import type { CrewMember } from '@/ui/premium';

import type { Person } from '../../data/use-people';

export function crewColour(joinIndex: number): string {
  return resolveMemberStyle(Math.max(0, Math.trunc(joinIndex))).color;
}

/** Faces for these ids, in order; people this phone doesn't know are left out. */
export function crewOf(
  people: ReadonlyMap<string, Person>,
  ids: readonly string[],
): readonly CrewMember[] {
  return ids.flatMap((id) => {
    const person = people.get(id);
    return person === undefined
      ? []
      : [{ id, name: person.name, color: crewColour(person.joinIndex) }];
  });
}

/** "Maya, Jordan and Ray" for a stack's spoken label. */
export function namesLine(members: readonly CrewMember[], and: string): string {
  const names = members.map((member) => member.name);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1] ?? ''}`;
}
