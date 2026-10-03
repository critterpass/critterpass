/**
 * The recap page's model from the story's rows, for the words the story shares with the page:
 * the dates and crew, the place, and the one that got away (named when it is a guide).
 */
import { guideNameOf } from '../data/critter-art';
import { buildSummaryModel, type SummaryModel } from '../summary/summary-model';
import type { StoryData } from './use-story-data';

export function storySummary(data: StoryData): SummaryModel {
  const gotAway = data.recap?.gotAway ?? null;
  return buildSummaryModel({
    loaded: data.loaded,
    viewerId: data.viewerId,
    viewerIn: true,
    trip:
      data.trip === null
        ? null
        : {
            startDate: data.trip.start_date,
            endDate: data.trip.end_date,
            solo: data.trip.is_solo === 1,
            crewName: data.trip.crew_name,
            place: data.trip.place,
          },
    recap: data.recap,
    awards: data.awards,
    names: new Map(data.travellers.map((person) => [person.userId, person.name])),
    forms: [],
    gotAwayName: gotAway === null ? null : guideNameOf(gotAway.critter_key),
  });
}
