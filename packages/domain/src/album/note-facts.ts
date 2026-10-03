/**
 * The facts the guide's album note may state (3m-2: "I picked 24 keepers. Nothing blurry, and
 * everyone's in at least three."), computed from the picks: the note can only say what these say,
 * so "everyone's in" is never written unless every traveller tagged in the album really is in
 * three of the picks.
 */
import { ALBUM_PICKS_PER_PERSON } from './select-picks';

export interface AlbumNoteFacts {
  readonly picks: number;
  readonly photos: number;
  /** The picks each tagged traveller should be in. */
  readonly per_person: number;
  readonly days: number;
  /** Blurry photos and near-duplicates the picks left out. */
  readonly blurry_skipped: number;
  readonly duplicates_skipped: number;
  /** Travellers tagged anywhere in the album. */
  readonly tagged_people: number;
  /** Of those, how many are in at least three picks. */
  readonly people_in_three: number;
  /** True only when every tagged traveller is in three picks (and someone is tagged). */
  readonly everyone_in_three: boolean;
}

export function albumNoteFacts(input: {
  readonly photos: number;
  readonly picks: readonly {
    readonly local_date: string | null;
    readonly people: readonly string[];
  }[];
  readonly tagged: readonly string[];
  readonly blurry: number;
  readonly duplicates: number;
}): AlbumNoteFacts {
  const tagged = [...new Set(input.tagged)];
  const inThree = tagged.filter(
    (person) =>
      input.picks.filter((p) => p.people.includes(person)).length >= ALBUM_PICKS_PER_PERSON,
  ).length;
  return {
    picks: input.picks.length,
    photos: input.photos,
    per_person: ALBUM_PICKS_PER_PERSON,
    days: new Set(input.picks.map((p) => p.local_date).filter((d) => d !== null)).size,
    blurry_skipped: input.blurry,
    duplicates_skipped: input.duplicates,
    tagged_people: tagged.length,
    people_in_three: inThree,
    everyone_in_three: tagged.length > 0 && inThree === tagged.length,
  };
}
