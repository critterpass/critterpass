/**
 * What each earlier draft was, so the list of drafts reads as a story rather than as clock times:
 * the guide's first draft, a later draft, a day redrafted (the redraft whose result became that
 * draft), or a draft changed some other way (by hand, or put back). Read from the drafting jobs'
 * results; a draft no job accounts for is "changed". Also which one is the current draft.
 */
/* eslint-disable lingui/no-unlocalized-strings -- kinds and wire keys, never copy. */
export type DraftOrigin =
  | { readonly kind: 'first' }
  | { readonly kind: 'drafted' }
  /** A redraft she kept (all of it, or with some changes left out). */
  | { readonly kind: 'redraft'; readonly dayNo: number | null }
  /** A redraft she looked at and put back: never part of the draft, still there to take. */
  | { readonly kind: 'put_back'; readonly dayNo: number | null }
  | { readonly kind: 'changed' };

export interface HistoryVersion {
  readonly id: string;
  readonly parentId: string | null;
}

export interface HistoryJob {
  readonly id: string;
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

/**
 * `versions` newest first; `putBack` holds the redraft jobs whose result she put back. The result
 * maps each draft worth listing to what it was: a redraft kept only in part is a copy of the
 * guide's version, so the copy is listed as the redraft and the guide's version is left out.
 */
export function draftOrigins(
  versions: readonly HistoryVersion[],
  jobs: readonly HistoryJob[],
  putBack: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, DraftOrigin> {
  const made = new Map<string, DraftOrigin>();
  for (const job of jobs) {
    const result = resultOf(job);
    if (job.kind === 'draft' && typeof result.version_id === 'string') {
      made.set(result.version_id, { kind: 'drafted' });
    }
    if (job.kind === 'redraft' && typeof result.candidate_version_id === 'string') {
      made.set(result.candidate_version_id, {
        kind: putBack.has(job.id) ? 'put_back' : 'redraft',
        dayNo: typeof result.day_no === 'number' ? result.day_no : null,
      });
    }
  }
  const keptInPart = new Set(
    versions.flatMap((version) =>
      !made.has(version.id) && made.get(version.parentId ?? '')?.kind === 'redraft'
        ? [version.parentId ?? '']
        : [],
    ),
  );
  const oldest = versions[versions.length - 1]?.id;
  const listed = new Map<string, DraftOrigin>();
  for (const version of versions) {
    if (keptInPart.has(version.id)) continue;
    const origin = made.get(version.id) ?? made.get(version.parentId ?? '');
    const own = made.has(version.id) || origin?.kind === 'redraft' ? origin : undefined;
    // The trip's first draft is the guide's, whether or not its job is still on the phone.
    if (version.id === oldest && (own === undefined || own.kind === 'drafted')) {
      listed.set(version.id, { kind: 'first' });
    } else listed.set(version.id, own ?? { kind: 'changed' });
  }
  return listed;
}

/** The current draft's id among `versions` (newest first): the trip's, else the newest. */
export function currentDraftId(
  versions: readonly HistoryVersion[],
  draftVersionId: string | null,
): string | null {
  if (draftVersionId !== null && versions.some((version) => version.id === draftVersionId)) {
    return draftVersionId;
  }
  return versions[0]?.id ?? null;
}
