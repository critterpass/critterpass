/**
 * The feedback outbox on the device: the media api with the signed-in session, file bytes and
 * hashing, and a runner that drains the outbox at launch, whenever something is added to it and
 * whenever the phone comes back online.
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes, HTTP verbs and algorithm names, never copy. */
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { File } from 'expo-file-system';
import { useEffect } from 'react';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { useLocalFirst } from '@/data/powersync/local-first-context';

import { drainFeedbackOutbox, type OutboxPorts } from './outbox';

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const deviceOutboxPorts: OutboxPorts = {
  async postJson(path, body) {
    const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json().catch(() => null)) as unknown };
  },
  // React Native's fetch does not send raw bytes reliably; XHR does (as chat uploads do).
  put(url, headers, bytes) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      xhr.onload = () => resolve({ status: xhr.status, body: null });
      xhr.onerror = () => reject(new Error('upload failed'));
      xhr.ontimeout = () => reject(new Error('upload timed out'));
      xhr.send(bytes);
    });
  },
  readBytes: (uri) => new File(uri).bytes(),
  sha256: async (bytes) => hex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes))),
};

/** Mounted once for the signed-in session (next to the app's other runtimes). */
export function FeedbackRuntime({ ports = deviceOutboxPorts }: { readonly ports?: OutboxPorts }) {
  const { db, commands, network } = useLocalFirst();
  useEffect(() => {
    let running = false;
    let again = false;
    const run = () => {
      if (!network.isOnline()) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      void drainFeedbackOutbox({ db, commands, ports })
        .catch(() => 0)
        .finally(() => {
          running = false;
          if (again) {
            again = false;
            run();
          }
        });
    };
    const controller = new AbortController();
    run();
    db.onChange(
      { onChange: run },
      { tables: ['local_state'], throttleMs: 200, signal: controller.signal },
    );
    const unsubscribe = network.subscribe((online) => {
      if (online) run();
    });
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [db, commands, network, ports]);
  return null;
}
