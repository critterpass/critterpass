/* eslint-disable lingui/no-unlocalized-strings -- wire values, stages and reasons, never copy. */
/**
 * Album uploads that keep going with the app closed. Each picked photo is rewritten without its
 * location and hashed on the device, skipped when the album already has the same bytes, given a
 * multipart upload, and handed to the system's background transfer. What is in flight is kept on
 * the phone, so after the app was closed or killed the queue picks each photo up where it was:
 * still transferring, transferred and waiting to be completed, or completed and waiting to be
 * registered. A photo that could not reach the server waits and goes again on `resume()`; an
 * expired upload link is renewed on its own a few times; anything else is marked failed until the
 * traveller retries it. A photo the system would not take is uploaded in the foreground instead.
 */
import type { Api, BackgroundUploadPorts, PendingUpload } from './background-types';
import type { AlbumUploads, PickedAlbumPhoto, UploadItem } from './upload-queue';

export type {
  Api,
  BackgroundUploadPorts,
  MultipartPlan,
  PendingUpload,
  Prepared,
  Stage,
  TransferSnapshot,
} from './background-types';

/** How many times a transfer is sent again on its own before it waits or fails. */
export const LINK_RENEWALS_MAX = 3;
const CONTENT_TYPE = 'image/jpeg';
/** The share of the bar the transfer fills; completing and registering take the rest. */
const TRANSFER_SHARE = 0.95;

interface Entry {
  record: PendingUpload;
  progress: number;
  /** The traveller asked for this one again: a refused transfer is sent once more. */
  asked: boolean;
}

export class BackgroundUploadQueue implements AlbumUploads {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private snapshot: readonly UploadItem[] = [];
  private chain: Promise<void> = Promise.resolve();
  private seen = new Set<string>();

  constructor(private readonly ports: BackgroundUploadPorts) {
    for (const record of ports.store.load()) {
      this.entries.set(record.id, { record, progress: 0, asked: false });
    }
    this.emit(false);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  items = (): readonly UploadItem[] => this.snapshot;

  /** Resolves once everything asked of the queue so far has been done (tests). */
  idle = (): Promise<void> => this.chain;

  add(tripId: string, photos: readonly PickedAlbumPhoto[], known: ReadonlySet<string>): void {
    this.know(known);
    for (const photo of photos) {
      const id = this.ports.newId();
      const record: PendingUpload = {
        id,
        tripId,
        photo,
        stage: 'new',
        state: 'uploading',
        renewals: 0,
      };
      this.entries.set(id, { record, progress: 0, asked: false });
      this.run(id);
    }
    this.emit();
  }

  /**
   * Picks every unfinished photo up where it is (after a relaunch, back online, back in front);
   * with `failed` set, failed ones start over too.
   */
  resume(known: ReadonlySet<string>, failed = false): void {
    this.know(known);
    for (const [id, entry] of this.entries) {
      const { state } = entry.record;
      if (state === 'done' || state === 'duplicate') continue;
      if (state === 'failed' && !failed) continue;
      entry.asked = state === 'failed';
      this.set(entry, { state: 'uploading', renewals: 0 });
      this.run(id);
    }
    this.emit();
  }

  clearSettled(tripId?: string): void {
    let cleared = false;
    for (const [id, entry] of this.entries) {
      if (tripId !== undefined && entry.record.tripId !== tripId) continue;
      if (entry.record.state === 'done' || entry.record.state === 'duplicate') {
        this.entries.delete(id);
        cleared = true;
      }
    }
    if (cleared) this.emit();
  }

  /** The system reported bytes sent for a transfer. */
  onProgress(id: string, sentBytes: number, totalBytes: number): void {
    const entry = this.entries.get(id);
    if (entry === undefined || entry.record.stage !== 'transferring' || totalBytes <= 0) return;
    entry.progress = Math.min(TRANSFER_SHARE, (sentBytes / totalBytes) * TRANSFER_SHARE);
    this.emit(false);
  }

  /** The system finished or gave up on a transfer: look at where it stands. */
  onSettled(id: string): void {
    if (this.entries.has(id)) this.run(id);
  }

  private know(known: ReadonlySet<string>): void {
    for (const sha of known) this.seen.add(sha);
  }

  private run(id: string): void {
    this.chain = this.chain.then(async () => {
      const entry = this.entries.get(id);
      if (entry === undefined || entry.record.state !== 'uploading') return;
      try {
        await this.advance(entry);
      } catch {
        this.set(entry, { state: 'failed' });
      }
      this.emit();
    });
  }

  private set(entry: Entry, change: Partial<PendingUpload>): void {
    entry.record = { ...entry.record, ...change };
  }

  private settle<T>(entry: Entry, answer: Api<T>): answer is { kind: 'ok'; value: T } {
    if (answer.kind === 'ok') return true;
    this.set(entry, { state: answer.kind === 'offline' ? 'waiting' : 'failed' });
    return false;
  }

  private async advance(entry: Entry): Promise<void> {
    if (entry.record.stage === 'new') await this.start(entry);
    if (entry.record.stage === 'transferring' && entry.record.state === 'uploading') {
      await this.follow(entry);
    }
    if (entry.record.stage === 'transferred' && entry.record.state === 'uploading') {
      await this.completeUpload(entry);
    }
    if (entry.record.stage === 'completed' && entry.record.state === 'uploading') {
      await this.registerPhoto(entry);
    }
  }

  /** Prepare, skip a duplicate, open the multipart upload and hand it to the system. */
  private async start(entry: Entry): Promise<void> {
    const { id, photo } = entry.record;
    let prepared = entry.record.prepared;
    if (prepared === undefined) {
      try {
        prepared = await this.ports.prepare(photo.uri, id);
      } catch {
        return this.toForeground(entry);
      }
      this.set(entry, { prepared });
    }
    const sha = prepared.sha256;
    const twin = [...this.entries.values()].some(
      (other) =>
        other !== entry &&
        other.record.prepared?.sha256 === sha &&
        other.record.plan !== undefined &&
        other.record.state !== 'failed',
    );
    if (this.seen.has(sha) || twin) {
      this.set(entry, { state: 'duplicate' });
      entry.progress = 1;
      await this.ports.finish(id).catch(() => undefined);
      return;
    }
    let plan = entry.record.plan;
    if (plan === undefined) {
      const created = await this.ports.createMultipart(prepared);
      if (!this.settle(entry, created)) return;
      plan = created.value;
      this.set(entry, { plan });
      this.persist();
    }
    const numbers = Array.from({ length: plan.partCount }, (_, index) => index + 1);
    const urls = await this.ports.partUrls(plan, numbers);
    if (!this.settle(entry, urls)) return;
    const { partBytes } = plan;
    const bytes = prepared.bytes;
    try {
      await this.ports.enqueue({
        id,
        filePath: prepared.path,
        contentType: CONTENT_TYPE,
        parts: numbers.map((partNumber) => {
          const offset = (partNumber - 1) * partBytes;
          return {
            partNumber,
            url: urls.value[partNumber] ?? '',
            offset,
            length: Math.min(partBytes, bytes - offset),
          };
        }),
      });
    } catch {
      return this.toForeground(entry);
    }
    this.set(entry, { stage: 'transferring' });
  }

  private toForeground(entry: Entry): void {
    const { id, tripId, photo } = entry.record;
    this.entries.delete(id);
    void this.ports.finish(id).catch(() => undefined);
    this.ports.foreground(tripId, photo, this.seen);
  }

  /** Reads the transfer as the system has it now. */
  private async follow(entry: Entry): Promise<void> {
    const { id, plan } = entry.record;
    const transfer = (await this.ports.transfers()).find((item) => item.id === id);
    // The system no longer knows the transfer (its store was cleared): it has to start over.
    if (transfer === undefined || plan === undefined) {
      this.set(entry, { stage: 'new', state: 'failed' });
      this.forget(entry);
      return;
    }
    if (transfer.state === 'done') {
      this.set(entry, { stage: 'transferred' });
      return;
    }
    if (transfer.state === 'uploading') {
      this.onProgress(id, transfer.sentBytes, transfer.totalBytes);
      return;
    }
    // The system gave up. Out of reach: wait and go again. An expired link: renew it. Anything
    // else is a refusal, sent again only when the traveller asks.
    const offline = transfer.failure === 'network';
    const expired = transfer.failure === 'http_403';
    const asked = entry.asked;
    entry.asked = false;
    if (!offline && !expired && !asked) {
      this.set(entry, { state: 'failed' });
      return;
    }
    if (!asked && entry.record.renewals >= LINK_RENEWALS_MAX) {
      this.set(entry, { state: offline ? 'waiting' : 'failed' });
      return;
    }
    const unsent = transfer.parts.filter((part) => part.state !== 'done').map((p) => p.partNumber);
    const urls = await this.ports.partUrls(plan, unsent);
    if (!this.settle(entry, urls)) return;
    await this.ports.retry(id, urls.value);
    this.set(entry, { renewals: entry.record.renewals + 1 });
  }

  /** Drops what was prepared and planned, so the photo starts over from the picked file. */
  private forget(entry: Entry): void {
    const { prepared: _prepared, plan: _plan, ...rest } = entry.record;
    entry.record = rest;
    void this.ports.finish(rest.id).catch(() => undefined);
  }

  private async completeUpload(entry: Entry): Promise<void> {
    const { id, plan, prepared } = entry.record;
    const transfer = (await this.ports.transfers()).find((item) => item.id === id);
    const parts = (transfer?.parts ?? []).flatMap((part) =>
      part.state === 'done' && part.etag !== undefined
        ? [{ part_number: part.partNumber, etag: part.etag }]
        : [],
    );
    if (plan === undefined || prepared === undefined || parts.length !== plan.partCount) {
      this.set(entry, { stage: 'new', state: 'failed' });
      this.forget(entry);
      return;
    }
    const done = await this.ports.complete(plan, prepared.sha256, parts);
    if (!this.settle(entry, done)) return;
    // Kept before registering: a multipart upload can be completed only once.
    this.set(entry, { stage: 'completed' });
    this.persist();
  }

  private async registerPhoto(entry: Entry): Promise<void> {
    const { id, tripId, photo, plan, prepared } = entry.record;
    if (plan === undefined || prepared === undefined) {
      this.set(entry, { state: 'failed' });
      return;
    }
    const result = await this.ports.register({
      photo_id: id,
      trip_id: tripId,
      media_key: plan.mediaKey,
      sha256: prepared.sha256,
      width: prepared.width ?? photo.width,
      height: prepared.height ?? photo.height,
      ...(photo.takenAt === undefined ? {} : { taken_at: photo.takenAt }),
      exif_gps_stripped: prepared.gpsStripped,
      faces_opt_in: false,
    });
    if (result.kind === 'rejected') return this.set(entry, { state: 'failed' });
    if (result.kind === 'unavailable') return this.set(entry, { state: 'waiting' });
    this.seen.add(prepared.sha256);
    this.set(entry, { state: 'done' });
    entry.progress = 1;
    await this.ports.finish(id).catch(() => undefined);
  }

  private persist(): void {
    this.ports.store.save(
      [...this.entries.values()]
        .map((entry) => entry.record)
        .filter((record) => record.state !== 'done' && record.state !== 'duplicate'),
    );
  }

  private emit(persist = true): void {
    if (persist) this.persist();
    this.snapshot = [...this.entries.values()].map((entry) => ({
      id: entry.record.id,
      tripId: entry.record.tripId,
      uri: entry.record.photo.uri,
      state: entry.record.state,
      progress: entry.progress,
    }));
    for (const listener of this.listeners) listener();
  }
}
