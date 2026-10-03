/**
 * `media` release items: one licensed photo or video loop proposed for a destination or place,
 * with its source, licence and credit. The shape lives in `@cp/domain` beside the read model.
 */
import { mediaCandidateSchema, type MediaCandidate } from '@cp/domain';

export const mediaItemSchema = mediaCandidateSchema;
export type MediaItem = MediaCandidate;

/**
 * A place's photos are proposed against its source ref (`fsq_os:<id>`, `overture:<id>`), the same
 * in every environment, as `poi:<source>-<id>` (`poi:fsq-os-4b0588…`). Publishing resolves the ref
 * to that environment's POI id, the `poi:<uuid>` subject the app reads.
 */
const POI_REF_SOURCES = { fsq_os: 'fsq-os', overture: 'overture' } as const;
export type PoiRefSource = keyof typeof POI_REF_SOURCES;

export function poiRefSubject(ref: string): string {
  const at = ref.indexOf(':');
  const source = ref.slice(0, at) as PoiRefSource;
  const id = ref.slice(at + 1).toLowerCase();
  if (at < 1 || !(source in POI_REF_SOURCES) || !/^[a-z0-9-]+$/u.test(id)) {
    throw new Error(`no media subject for place ref ${ref}`);
  }
  return `poi:${POI_REF_SOURCES[source]}-${id}`;
}

/** The place ref a `poi:<source>-<id>` subject names, or null for any other subject. */
export function poiRefOfSubject(subject: string): { source: PoiRefSource; id: string } | null {
  for (const [source, prefix] of Object.entries(POI_REF_SOURCES)) {
    const head = `poi:${prefix}-`;
    if (subject.startsWith(head) && subject.length > head.length) {
      return { source: source as PoiRefSource, id: subject.slice(head.length) };
    }
  }
  return null;
}
