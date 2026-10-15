/** The recap signature's form state, shared by every view of the signature sheet. */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { feedback, toast } from '@/motion';
import type { Signature } from './signature-pad';
import { uploadStroke } from './upload';
import type { SignatureSheetProps } from '../story/story-look';

export const PAD_HEIGHT = 160;

/** The signature's state for any view of it: what is on the pad, its width, and saving it. */
export function useSignatureForm({
  onClose,
  onSaved,
  upload = uploadStroke,
}: Omit<SignatureSheetProps, 'name'>) {
  const { t } = useLingui();
  const [value, setValue] = useState<Signature | null>(null);
  const [width, setWidth] = useState(0);
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (value === null || value.kind === 'typed') {
      onClose();
      return;
    }
    setSaving(true);
    const mediaId = await upload({ v: 1, width, height: PAD_HEIGHT, path: value.path });
    if (mediaId === null) {
      setSaving(false);
      feedback.emit('error');
      toast.show({
        id: 'recap-signature',
        title: t({
          id: 'recap.signature.failed',
          message: "Couldn't send your signature. Try again with signal.",
        }),
      });
      return;
    }
    if (!(await onSaved(mediaId))) {
      setSaving(false);
      return;
    }
    feedback.emit('success');
    onClose();
  }

  return { value, setValue, setWidth, saving, save: () => void onSave() };
}
