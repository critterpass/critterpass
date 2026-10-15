/** A search row's place name with the typed part bold (4.02). */
import { Text } from '@/ui/premium';

import { matchSpan } from './match-span';

export function ResultName({ name, typed }: { readonly name: string; readonly typed: string }) {
  const span = matchSpan(name, typed);
  if (span === null) {
    return (
      <Text variant="body" numberOfLines={1}>
        {name}
      </Text>
    );
  }
  return (
    <Text variant="body" numberOfLines={1}>
      {name.slice(0, span.start)}
      <Text variant="headline">{name.slice(span.start, span.end)}</Text>
      {name.slice(span.end)}
    </Text>
  );
}
