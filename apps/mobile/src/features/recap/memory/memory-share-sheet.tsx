/**
 * The share sheet for a year-later memory: the picture (the photo, the guide, the words and the
 * crew's signatures) is drawn on the phone, story first.
 */
import { resolveMemberStyle } from '@cp/design-tokens';
import { useMemo } from 'react';

import { memberName } from '@/ui/people/member-name';
import { ShareSheet, type ShareFormat } from '@/ui/share-image/ShareSheet';

import { fetchStroke } from '../signature/stroke-store';
import { deviceShareDeps } from '../summary/share-card';
import { renderMemoryCard } from './memory-share';
import type { MemorySigner } from './use-memory';

async function photoBytes(url: string | null): Promise<Uint8Array | null> {
  if (url === null) return null;
  try {
    const response = await fetch(url);
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export interface MemoryShareSheetProps {
  readonly guideKind: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly photoUrl: string | null;
  readonly signers: readonly MemorySigner[];
  readonly onClose: () => void;
}

export function MemoryShareSheet(props: MemoryShareSheetProps) {
  const { guideKind, eyebrow, title, body, photoUrl } = props;
  const deps = useMemo(() => deviceShareDeps(), []);
  // The signers arrive as a fresh list on every render of the screen; the picture is only drawn
  // again when one of them actually changed.
  const signersKey = JSON.stringify(props.signers);
  const signers = useMemo(() => JSON.parse(signersKey) as readonly MemorySigner[], [signersKey]);
  const render = useMemo(
    () => async (format: ShareFormat) => {
      const [photo, strokes] = await Promise.all([
        photoBytes(photoUrl),
        Promise.all(
          signers.map((s) =>
            s.strokeKey === null ? Promise.resolve(null) : fetchStroke(s.strokeKey),
          ),
        ),
      ]);
      return renderMemoryCard(
        {
          guideKind,
          eyebrow,
          title,
          body,
          photo,
          signers: signers.map((signer, index) => ({
            name: memberName(signer.name),
            colour: signer.colour ?? resolveMemberStyle(index).color,
            stroke: strokes[index] ?? null,
          })),
        },
        format,
      );
    },
    [guideKind, eyebrow, title, body, photoUrl, signers],
  );
  return (
    <ShareSheet
      altText={`${title}. ${body}`}
      render={render}
      deps={deps}
      onClose={props.onClose}
      testID="memory-share"
    />
  );
}
