/**
 * What each earlier draft was, so the list of drafts reads as a story rather than as clock times:
 * the guide's first draft, a later draft, a day redrafted (the redraft whose result became that
 * draft), or a draft changed some other way (by hand, or put back). Read from the drafting jobs'
 * results; a draft no job accounts for is "changed". Also which one is the current draft.
 */
export type DraftOrigin =
  | { readonly kind: 'first' }
  | { readonly kind: 'drafted' }
  | { readonly kind: 'redraft'; readonly dayNo: number | null }
  | { readonly kind: 'changed' };

export interface HistoryJob {
  readonly kind: string;
  readonly result_ref: string | null;
}

interface JobResult {
  readonly version_id?: unknown;
  readonly candidate_version_id?: unknown;
  readonly day_no?: unknown;
}

function resultOf(job: HistoryJob): JobResult {
  try {
    const parsed = JSON.parse(job.result_ref ?? 'null') as JobResult | null;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** `versions` newest first (ids only); the result maps each id to what that draft was. */
export function draftOrigins(
  versions: readonly string[],
  jobs: readonly HistoryJob[],
): ReadonlyMap<string, DraftOrigin> {
  const made = new Map<string, DraftOrigin>();
  for (const job of jobs) {
    const result = resultOf(job);
    if (job.kind === 'draft' && typeof result.version_id === 'string') {
      made.set(result.version_id, { kind: 'drafted' });
    }
    if (job.kind === 'redraft' && typeof result.candidate_version_id === 'string') {
      made.set(result.candidate_version_id, {
        kind: 'redraft',
        dayNo: typeof result.day_no === 'number' ? result.day_no : null,
      });
    }
  }
  const oldest = versions[versions.length - 1];
  return new Map(
    versions.map((id): [string, DraftOrigin] => {
      const origin = made.get(id);
      // The trip's first draft is the guide's, whether or not its job is still on the phone.
      if (id === oldest && (origin === undefined || origin.kind === 'drafted')) {
        return [id, { kind: 'first' }];
      }
      return [id, origin ?? { kind: 'changed' }];
    }),
  );
}

/** The current draft's id among `versions` (newest first): the trip's, else the newest. */
export function currentDraftId(
  versions: readonly string[],
  draftVersionId: string | null,
): string | null {
  if (draftVersionId !== null && versions.includes(draftVersionId)) return draftVersionId;
  return versions[0] ?? null;
}
