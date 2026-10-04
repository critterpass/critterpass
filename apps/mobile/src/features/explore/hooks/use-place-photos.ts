/**
 * The photos of a set of places (a swipe deck), read in as few requests as the api allows (20
 * subjects each, so a full deck of 30 is two reads), each place's hero by its POI id. The read is
 * keyed by the sorted ids, so swiping through the deck does not read again. A place with no asset
 * of its own is simply missing: the card draws its category's doodle.
 */
import { DECK_SIZE, type PlaceMediaAsset } from '@cp/domain';
import { useMemo } from 'react';

import { useSubjectMedia } from '@/data/media/use-subject-media';

import { poiSubject } from '../format';
import { photosByPlace } from '../place-photo';

const SUBJECTS_PER_READ = 20;

function chunkSubjects(ids: readonly string[], index: number): string | null {
  const chunk = ids.slice(index * SUBJECTS_PER_READ, (index + 1) * SUBJECTS_PER_READ);
  return chunk.length === 0 ? null : chunk.map(poiSubject).join(',');
}

export function usePlacePhotos(poiIds: readonly string[]): ReadonlyMap<string, PlaceMediaAsset> {
  const key = [...new Set(poiIds)].sort().slice(0, DECK_SIZE).join(',');
  const ids = useMemo(() => (key === '' ? [] : key.split(',')), [key]);
  const first = useSubjectMedia(chunkSubjects(ids, 0)).items;
  const second = useSubjectMedia(chunkSubjects(ids, 1)).items;
  return useMemo(() => photosByPlace([...first, ...second], ids), [first, second, ids]);
}
