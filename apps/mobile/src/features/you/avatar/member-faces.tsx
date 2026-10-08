/**
 * Members' faces for every place a member is drawn (chat, crew rows, the PASS face): one shared
 * live read of the synced avatars, however many avatars are on screen, and photo read links fetched
 * in one batch and kept until shortly before they lapse. `MemberFacesRoot` hands the faces to every
 * `Avatar` that carries a `uid`; `faceProps(uid)` gives the same props to a screen that draws a
 * face itself. Anyone without one keeps their initial.
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { FormSticker } from '@/features/critters';
import { guideSticker } from '@/ui/avatar/guides';
import type { AvatarSize } from '@/ui/people/Avatar';
import { MemberFaceProvider, type MemberFaceResolver } from '@/ui/people/member-face';
import { Sticker } from '@/ui/sticker/Sticker';
import { sizeToken, useTheme } from '@/ui/theme';

import {
  faceOf,
  MEMBER_AVATARS_SQL,
  MEMBER_AVATARS_TABLES,
  type AvatarRow,
  type MemberFace,
} from './member-face';

const EARLY_MS = 60_000;
const VIEWER_SQL = 'SELECT value FROM local_state WHERE id = ?';
const DEFAULT_TTL_MS = 15 * 60_000;

interface Store {
  rows: ReadonlyMap<string, AvatarRow>;
  viewer: string | null;
  urls: ReadonlyMap<string, { url: string; until: number }>;
  version: number;
  listeners: Set<() => void>;
  stop: (() => void) | null;
  fetching: Set<string>;
}

const stores = new WeakMap<AbstractPowerSyncDatabase, Store>();
const EMPTY_STORE: Store = {
  rows: new Map(),
  viewer: null,
  urls: new Map(),
  version: 0,
  listeners: new Set(),
  stop: null,
  fetching: new Set(),
};

function storeFor(db: AbstractPowerSyncDatabase): Store {
  let store = stores.get(db);
  if (store === undefined) {
    store = {
      rows: new Map(),
      viewer: null,
      urls: new Map(),
      version: 0,
      listeners: new Set(),
      stop: null,
      fetching: new Set(),
    };
    stores.set(db, store);
  }
  return store;
}

function notify(store: Store): void {
  store.version += 1;
  for (const listener of store.listeners) listener();
}

async function fetchReadUrls(store: Store, keys: readonly string[]): Promise<void> {
  const wanted = keys.filter((key) => {
    const hit = store.urls.get(key);
    return !store.fetching.has(key) && (hit === undefined || hit.until <= Date.now());
  });
  if (wanted.length === 0) return;
  for (const key of wanted) store.fetching.add(key);
  try {
    const { sessionHeaders } = await import('@/data/app-session/auth-client');
    const response = await fetch(`${resolveApiBaseUrl()}/v1/media/read-urls`, {
      method: 'POST',
      headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify({ media_keys: wanted }),
    });
    if (response.status !== 200) return;
    const body = (await response.json()) as {
      urls?: { media_key: string; url: string }[];
      expires_at?: string;
    };
    const until =
      (body.expires_at ? Date.parse(body.expires_at) : Date.now() + DEFAULT_TTL_MS) - EARLY_MS;
    const next = new Map(store.urls);
    for (const entry of body.urls ?? []) next.set(entry.media_key, { url: entry.url, until });
    store.urls = next;
    notify(store);
  } catch {
    // No signal: the initial shows until the next read brings the link.
  } finally {
    for (const key of wanted) store.fetching.delete(key);
  }
}

function start(db: AbstractPowerSyncDatabase, store: Store): void {
  const controller = new AbortController();
  const load = () =>
    Promise.all([
      db.getAll<AvatarRow>(MEMBER_AVATARS_SQL),
      db.getAll<{ value: string }>(VIEWER_SQL, [OWNER_UID_KEY]),
    ]).then(
      ([rows, viewer]) => {
        if (controller.signal.aborted) return;
        store.rows = new Map(rows.map((row) => [row.user_id, row]));
        store.viewer = viewer[0]?.value ?? null;
        notify(store);
      },
      () => undefined,
    );
  void load();
  db.onChange(
    { onChange: () => load() },
    {
      tables: [...MEMBER_AVATARS_TABLES, 'local_state'],
      throttleMs: 50,
      signal: controller.signal,
    },
  );
  store.stop = () => controller.abort();
}

function subscribe(db: AbstractPowerSyncDatabase, store: Store, listener: () => void) {
  store.listeners.add(listener);
  if (store.stop === null) start(db, store);
  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0) {
      store.stop?.();
      store.stop = null;
    }
  };
}

export interface FaceProps {
  readonly photo?: { readonly uri: string };
  readonly critter?: ReactNode;
}

/** The sticker inside an avatar circle: a little smaller than the circle, as on the profile. */
const STICKER_FILL = 0.82;

/** `Avatar` props for a face, or none for an initial (or a photo whose link is not here yet). */
export function facePropsOf(face: MemberFace, url: string | null, diameter: number): FaceProps {
  switch (face.kind) {
    case 'photo':
      return url === null ? {} : { photo: { uri: url } };
    case 'guide': {
      const guide = guideSticker(face.guide);
      return {
        critter: (
          <Sticker kind={guide.kind} name={guide.name} size={Math.round(diameter * STICKER_FILL)} />
        ),
      };
    }
    case 'form':
      return {
        critter: <FormSticker form={face.formId} size={Math.round(diameter * STICKER_FILL)} />,
      };
    case 'initials':
      return {};
  }
}

/** The shared store of the signed-in session, read live; photo links are fetched as they appear. */
function useFaceStore(): { readonly store: Store; readonly version: number } {
  // Outside a signed-in session (a lab scene, a test) there are no faces: everyone keeps an initial.
  const db = useContext(LocalFirstContext)?.db ?? null;
  const store = db === null ? EMPTY_STORE : storeFor(db);
  const version = useSyncExternalStore(
    useCallback(
      (listener: () => void) => (db === null ? () => undefined : subscribe(db, store, listener)),
      [db, store],
    ),
    () => store.version,
  );
  const viewer = store.viewer;
  const photoKeys = [...store.rows.values()]
    .map((row) => faceOf(row, viewer))
    .flatMap((face) => (face.kind === 'photo' ? [face.mediaKey] : []));
  const keysLine = photoKeys.join('|');
  useEffect(() => {
    if (db !== null && photoKeys.length > 0) void fetchReadUrls(store, photoKeys);
    // The keys are folded into `keysLine`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, keysLine]);
  return { store, version };
}

function resolveFace(store: Store, uid: string, diameter: number): FaceProps {
  const current = faceOf(store.rows.get(uid), store.viewer);
  const url = current.kind === 'photo' ? (store.urls.get(current.mediaKey)?.url ?? null) : null;
  return facePropsOf(current, url, diameter);
}

/** `faceOf(uid)` and `faceProps(uid, size)` over every member the phone knows. */
export function useMemberFaces(): {
  readonly faceOf: (uid: string) => MemberFace;
  readonly faceProps: (uid: string, size: AvatarSize) => FaceProps;
} {
  const theme = useTheme();
  const { store } = useFaceStore();
  return {
    faceOf: (uid) => faceOf(store.rows.get(uid), store.viewer),
    faceProps: (uid, size) => resolveFace(store, uid, sizeToken(theme.size.avatar, size)),
  };
}

/**
 * Answers "whose face is this?" for every `Avatar` and `AvatarStack` that carries a `uid`. Mounted
 * once at the app root, inside the session; the answer is renewed only when a face or a photo link
 * changes, so avatars redraw then and not on every render above them.
 */
export function MemberFacesRoot({ children }: { readonly children: ReactNode }) {
  const { store, version } = useFaceStore();
  const resolve = useMemo<MemberFaceResolver>(
    () => (uid, diameter) => resolveFace(store, uid, diameter),
    // The store is changed in place; its version says when.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version],
  );
  return <MemberFaceProvider resolve={resolve}>{children}</MemberFaceProvider>;
}
