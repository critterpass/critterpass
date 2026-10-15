/**
 * The judged half of the blog benchmark: a seasoned travel writer reads the drafted days beside
 * the days most itinerary pages lay out for a first visit, scores each drafted day and the trip
 * 1-10 for the crew described, and says which they would rather hand a reader and why. Runs on
 * the pro route the eval judge uses (it thinks before answering; no tools).
 */
import type { DraftModel } from '@cp/ai';
import { z } from 'zod';

import type { ConsensusDay } from './reference';
import type { ScoredDay } from './score';

const SYSTEM = `You are a seasoned travel writer who has written first-visit itineraries for this destination.
You compare a drafted trip with the way most itinerary pages lay out the same number of days, for the crew described.
Judge what a reader would live through: the right sights for a first visit, each day kept to one or two neighbouring areas, places at the right time of day (markets early, viewpoints at sunset, nightlife after dark), real lunches and dinners worth eating, variety, and fit with the crew's tastes.
The draft need not copy the pages: a different but equally good day scores as well.
Answer with JSON only: {"days":[{"day":1,"score":7,"why":"..."}],"overall":7,"prefer":"draft"|"pages"|"tie","why":"..."}
Scores are 1-10 (10 = as good as the best page). Each "why" at most 25 words.`;

const verdictSchema = z.object({
  days: z.array(z.object({ day: z.number(), score: z.number(), why: z.string() })),
  overall: z.number().min(1).max(10),
  prefer: z.enum(['draft', 'pages', 'tie']),
  why: z.string(),
});
export type Verdict = z.infer<typeof verdictSchema>;

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export function judgeBrief(
  destination: string,
  crew: string,
  pages: readonly ConsensusDay[],
  draft: readonly ScoredDay[],
): string {
  const pageDays = pages
    .map(
      (day) =>
        `Day ${day.day} (${day.theme_en}; areas ${day.areas.join(', ')}; ${day.source_count} pages): ${day.stops.join(' → ')}`,
    )
    .join('\n');
  const draftDays = draft
    .map(
      (day) =>
        `Day ${day.dayNo} (${day.theme}):\n${day.stops
          .map(
            (s) =>
              `  ${clock(s.startMin)} ${s.kind === 'meal' ? '[meal] ' : ''}${s.name}${s.area === null ? '' : ` (${s.area})`}`,
          )
          .join('\n')}`,
    )
    .join('\n');
  return `Destination: ${destination}\nCrew: ${crew}\n\nHow most itinerary pages lay out a first visit:\n${pageDays}\n\nThe drafted trip:\n${draftDays}`;
}

export async function judgeDraft(model: DraftModel, brief: string, key: string): Promise<Verdict> {
  const result = await model.call(
    'draft.repair',
    { system: SYSTEM, messages: [{ role: 'user', content: brief }] },
    key,
  );
  const text = result.message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  return verdictSchema.parse(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
}
