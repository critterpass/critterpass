/**
 * The signature sheet (undesigned): asked once, on the stamp card, while the traveller has no
 * signature yet. They sign the pad with a finger and it signs every stamp they share with the
 * crew, live on everyone's recap; or they keep their name in the signature hand instead.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { feedback, toast } from '@/motion';
import { PillButton } from '@/ui/buttons/PillButton';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { SignatureLayer, type Signature } from '@/ui/documents/SignatureLayer';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';

import { uploadStroke } from './upload';

export const PAD_HEIGHT = 160;

export interface SignatureSheetProps {
  readonly name: string;
  readonly onClose: () => void;
  /** Saves the uploaded stroke as the traveller's signature (`save_signature`). */
  /** Saves the signature; false when it did not go through (the caller has said why). */
  readonly onSaved: (mediaId: string) => Promise<boolean>;
  readonly upload?: typeof uploadStroke;
}

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

export function SignatureSheet(props: SignatureSheetProps) {
  const { t } = useLingui();
  const { value, setValue, setWidth, saving, save } = useSignatureForm(props);
  const { name, onClose } = props;
  const title = t({ id: 'recap.signature.title', message: 'Sign the crew stamp' });
  return (
    <Sheet
      detents={['fit']}
      onDismiss={onClose}
      accessibilityLabel={title}
      testID="recap-signature"
    >
      <Stack gap="12" padding="16">
        <Text variant="h3" accessibilityRole="header">
          {title}
        </Text>
        <SecondaryText variant="body">
          {t({
            id: 'recap.signature.line',
            message: 'Once, and it signs every stamp you share with the crew, in your colour.',
          })}
        </SecondaryText>
        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          <SignatureLayer name={name} value={value} onChange={setValue} height={PAD_HEIGHT} />
        </View>
        <PillButton
          label={
            value?.kind === 'drawn'
              ? t({ id: 'recap.signature.save', message: 'Sign it' })
              : t({ id: 'recap.signature.later', message: 'Keep my name' })
          }
          loading={saving}
          onPress={save}
          testID="recap-signature-save"
        />
      </Stack>
    </Sheet>
  );
}
